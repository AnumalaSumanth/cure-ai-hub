import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";

/**
 * Educational study assistant. Reuses the existing Study AI plan generator for
 * plan requests, and explains concepts otherwise.
 */
export const studyTool: AgentTool = {
  name: "study_assistant",
  description: "Explain medical concepts for students or outline a short study plan.",
  inputSchema: z.object({
    topic: z.string().min(2).max(500),
    wants_plan: z.boolean().default(false),
  }),
  async execute(args, ctx) {
    const { topic, wants_plan } = args as { topic: string; wants_plan?: boolean };

    let retrieved = "";
    try {
      const { retrieveContext } = await import("@/lib/rag.server");
      retrieved = await retrieveContext(ctx.supabase, ctx.userId, topic, 4);
    } catch (err) {
      console.error("[agent:study] retrieval failed", (err as Error)?.message);
    }

    const prompt = wants_plan
      ? `${MEDICAL_SAFETY_SYSTEM}

Create a concise 5-day study outline for a medical student on: ${topic}.
${retrieved}
Format as markdown: one bullet per day with focus, key concepts and a revision task. End with one short study tip, and mention that a fuller, saveable plan can be generated on the Study AI page. This is educational content, not clinical advice.`
      : `${MEDICAL_SAFETY_SYSTEM}

Explain for a medical student: ${topic}.
${retrieved}
Short markdown: definition, key mechanism/points, clinical relevance, and one high-yield exam tip. Educational only.`;

    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({ model, prompt, maxOutputTokens: 1100 });
        return res.text.trim();
      });
      if (!text) throw new Error("empty");
      return { ok: true, content: text, sources: retrieved ? ["Your Medical Library"] : [] };
    } catch (err) {
      console.error("[agent:study]", (err as Error)?.message);
      return { ok: false, content: "I couldn't put that together right now. Please try again." };
    }
  },
};
