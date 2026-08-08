import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";

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

    const prompt = `${MEDICAL_SAFETY_SYSTEM}

Conversation so far (use it to resolve references like "it"):
${history || "(none)"}

The user describes: ${symptoms}

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
      return { ok: true, content: text, needsClarification: /\?\s*$/.test(text) };
    } catch (err) {
      console.error("[agent:symptom_guidance]", (err as Error)?.message);
      return {
        ok: false,
        content: `I couldn't analyse that right now. Please try again in a moment. ${AGENT_DISCLAIMER}`,
      };
    }
  },
};
