import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";
import { memoryContext } from "../memory";
import { formatTrustedNotes, searchTrustedNotes } from "../knowledge/trusted-sources";

export const symptomTool: AgentTool = {
  name: "symptom_guidance",
  description:
    "Give general, non-diagnostic guidance about described symptoms and highlight warning signs.",
  inputSchema: z.object({
    symptoms: z.string().min(2).max(2000),
  }),
  async execute(args, ctx) {
    const { symptoms } = args as { symptoms: string };
    const history = ctx.history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Cure AI"}: ${m.content}`)
      .join("\n");

    const sources: string[] = [];
    const notes = searchTrustedNotes(symptoms, 2);
    for (const n of notes) sources.push(n.source);

    let retrieved = "";
    let groundingRules = "";
    let noGrounding = "";
    try {
      const { retrieveGrounding, GROUNDING_RULES, NO_GROUNDING_NOTE } = await import("@/lib/rag.server");
      const g = await retrieveGrounding(ctx.supabase, ctx.userId, symptoms, 3);
      groundingRules = GROUNDING_RULES;
      if (g.used) {
        retrieved = g.context;
        sources.push(...g.sources);
      } else {
        noGrounding = NO_GROUNDING_NOTE;
      }
    } catch (err) {
      console.error("[agent:symptom] retrieval failed", (err as Error)?.message);
    }

    const prompt = `${MEDICAL_SAFETY_SYSTEM}

${groundingRules}

${ctx.memory ? memoryContext(ctx.memory) : ""}

Conversation so far (use it to resolve references like "it"):
${history || "(none)"}

The user describes: ${symptoms}
${formatTrustedNotes(notes)}${retrieved}${noGrounding}

Respond in short markdown:
1. One sentence acknowledging what they described.
2. "Possible general causes" — 2-4 common, non-diagnostic possibilities.
3. "Self-care that is usually safe" — 2-4 general measures (no prescription medicines, no dosages).
4. "See a professional if" — clear warning signs.
5. Exactly ONE follow-up question that would help a clinician (e.g. duration or severity 1-10), unless the user already answered it.

Never state a diagnosis. Never suggest starting, stopping or changing prescription medication.`;

    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({ model, prompt, maxOutputTokens: 900 });
        return res.text.trim();
      });
      if (!text) throw new Error("empty");
      return {
        ok: true,
        content: text,
        needsClarification: /\?\s*$/.test(text),
        sources: [...new Set(sources)],
      };
    } catch (err) {
      console.error("[agent:symptom_guidance]", (err as Error)?.message);
      return {
        ok: false,
        content: `I couldn't analyse that right now. Please try again in a moment. ${AGENT_DISCLAIMER}`,
      };
    }
  },
};
