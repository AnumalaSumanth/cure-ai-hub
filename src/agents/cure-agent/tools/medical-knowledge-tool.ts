import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";
import { memoryContext } from "../memory";
import { formatTrustedNotes, searchTrustedNotes } from "../knowledge/trusted-sources";

/**
 * Answers medical knowledge questions with retrieval-augmented generation:
 * curated trusted reference notes + the user's own Medical Library are
 * retrieved first, and the answer is grounded in that material.
 */
export const medicalKnowledgeTool: AgentTool = {
  name: "search_medical_knowledge",
  description: "Explain a medical concept, term or general health question.",
  inputSchema: z.object({ query: z.string().min(2).max(1000) }),
  async execute(args, ctx) {
    const { query } = args as { query: string };
    const sources: string[] = [];

    // 1. Trusted reference material (deterministic, always available).
    const notes = searchTrustedNotes(query, 3);
    for (const n of notes) sources.push(n.source);

    // 2. The user's own Medical Library via the existing RAG layer.
    let retrieved = "";
    let groundingRules = "";
    let noGrounding = "";
    try {
      const { retrieveGrounding, GROUNDING_RULES, NO_GROUNDING_NOTE } = await import("@/lib/rag.server");
      const g = await retrieveGrounding(ctx.supabase, ctx.userId, query, 4);
      groundingRules = GROUNDING_RULES;
      if (g.used) {
        retrieved = g.context;
        sources.push(...g.sources);
      } else {
        noGrounding = NO_GROUNDING_NOTE;
      }
    } catch (err) {
      console.error("[agent:knowledge] retrieval failed", (err as Error)?.message);
    }

    const memo = ctx.memory ? memoryContext(ctx.memory) : "";
    const grounding = `${formatTrustedNotes(notes)}${retrieved}${noGrounding}`;

    const prompt = `${MEDICAL_SAFETY_SYSTEM}

${groundingRules}

${memo}

Question: ${query}
${grounding || "\n\n(No retrieved reference material was available.)"}

Answer in short markdown: a plain-language explanation, why it matters, and typical context.
Never invent citations, studies, journals or sources. Never give a diagnosis, prescription or dosage.`;

    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({ model, prompt, maxOutputTokens: 900 });
        return res.text.trim();
      });
      if (!text) throw new Error("empty");
      return { ok: true, content: text, sources: [...new Set(sources)] };
    } catch (err) {
      console.error("[agent:knowledge]", (err as Error)?.message);
      return {
        ok: false,
        content: `I couldn't look that up right now. Please try again. ${AGENT_DISCLAIMER}`,
      };
    }
  },
};
