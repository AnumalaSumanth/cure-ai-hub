import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";

/**
 * Answers medical knowledge questions. Reuses the existing RAG layer over the
 * user's own Medical Library and clearly separates retrieved material from
 * general model knowledge.
 */
export const medicalKnowledgeTool: AgentTool = {
  name: "search_medical_knowledge",
  description: "Explain a medical concept, term or general health question.",
  inputSchema: z.object({ query: z.string().min(2).max(1000) }),
  async execute(args, ctx) {
    const { query } = args as { query: string };
    let retrieved = "";
    try {
      const { retrieveContext } = await import("@/lib/rag.server");
      retrieved = await retrieveContext(ctx.supabase, ctx.userId, query, 4);
    } catch (err) {
      console.error("[agent:knowledge] retrieval failed", (err as Error)?.message);
    }

    const prompt = `${MEDICAL_SAFETY_SYSTEM}

Question: ${query}
${retrieved}

Answer in short markdown: a plain-language explanation, why it matters, and typical context.
If the reference material above was provided, use it and mention that part of the answer comes from the user's own Medical Library. Never invent citations, studies or sources.`;

    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({ model, prompt, maxOutputTokens: 900 });
        return res.text.trim();
      });
      if (!text) throw new Error("empty");
      return {
        ok: true,
        content: text,
        sources: retrieved ? ["Your Medical Library"] : [],
      };
    } catch (err) {
      console.error("[agent:knowledge]", (err as Error)?.message);
      return {
        ok: false,
        content: `I couldn't look that up right now. Please try again. ${AGENT_DISCLAIMER}`,
      };
    }
  },
};
