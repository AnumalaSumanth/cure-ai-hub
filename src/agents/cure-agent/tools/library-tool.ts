import { z } from "zod";
import type { AgentTool } from "../types";

/**
 * Searches the signed-in user's own Medical Library. Always filtered by
 * user_id on top of RLS — never returns another user's documents.
 */
export const libraryTool: AgentTool = {
  name: "search_medical_library",
  description: "Find relevant documents in the user's own Medical Library.",
  inputSchema: z.object({ query: z.string().max(300).optional() }),
  async execute(args, ctx) {
    const { query } = args as { query?: string };

    let q = ctx.supabase
      .from("medical_documents")
      .select("file_name, category, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(8);
    const term = query?.trim();
    if (term) q = q.ilike("file_name", `%${term.replace(/[%_]/g, "")}%`);

    const { data, error } = await q;
    if (error) {
      console.error("[agent:library] read failed", error.message);
      return { ok: false, content: "I couldn't search your library right now. Please try again." };
    }
    if (!data?.length) {
      return {
        ok: true,
        content: term
          ? `I didn't find anything matching "${term}" in your Medical Library.`
          : "Your Medical Library is empty. Upload documents on the Medical Library page and I can use them here.",
      };
    }

    let passages = "";
    if (term) {
      try {
        const { retrieveContext } = await import("@/lib/rag.server");
        passages = await retrieveContext(ctx.supabase, ctx.userId, term, 3);
      } catch (err) {
        console.error("[agent:library] retrieval failed", (err as Error)?.message);
      }
    }

    const list = data
      .map((d) => `- **${d.file_name}**${d.category ? ` · ${d.category}` : ""}`)
      .join("\n");
    return {
      ok: true,
      content: `From your Medical Library:\n\n${list}${
        passages ? `\n\nRelevant excerpts:${passages}` : ""
      }`,
      sources: data.map((d) => d.file_name),
    };
  },
};
