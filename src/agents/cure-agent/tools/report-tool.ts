import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";

/**
 * Explains a health report the user already uploaded to their own Medical
 * Library. Strictly scoped to the authenticated user's rows (RLS + explicit
 * user_id filter). Never fabricates values.
 */
export const reportTool: AgentTool = {
  name: "analyze_health_report",
  description: "Explain values and terminology in one of the user's own uploaded health reports.",
  inputSchema: z.object({
    document_id: z.string().uuid().optional(),
    query: z.string().max(1000).optional(),
  }),
  async execute(args, ctx) {
    const { document_id, query } = args as { document_id?: string; query?: string };

    let docQuery = ctx.supabase
      .from("medical_documents")
      .select("id, file_name, file_path, file_type, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (document_id) docQuery = docQuery.eq("id", document_id);

    const { data: docs, error } = await docQuery;
    if (error) {
      console.error("[agent:report] db error", error.message);
      return { ok: false, content: "I couldn't access your documents right now. Please try again." };
    }
    if (!docs?.length) {
      return {
        ok: true,
        needsClarification: true,
        content: document_id
          ? "I couldn't find that report in your Medical Library, or it isn't yours to access."
          : "I don't see a report in your Medical Library yet. Upload it under **Medical Library** and I'll walk you through it.",
      };
    }

    const doc = docs[0]!;
    let text = "";
    try {
      const textLike =
        (doc.file_type ?? "").startsWith("text/") ||
        /\.(txt|md|csv|json)$/i.test(doc.file_name);
      if (textLike) {
        const { data: file } = await ctx.supabase.storage
          .from("medical-library")
          .download(doc.file_path);
        if (file) text = (await file.text()).slice(0, 12000);
      }
    } catch (err) {
      console.error("[agent:report] download failed", (err as Error)?.message);
    }

    if (!text) {
      return {
        ok: true,
        content: `I found **${doc.file_name}** in your Medical Library, but I can't read its contents directly (only plain-text reports are readable today). You can paste the values here and I'll explain what they mean.\n\n${AGENT_DISCLAIMER}`,
        sources: [doc.file_name],
      };
    }

    const prompt = `${MEDICAL_SAFETY_SYSTEM}

Report file: ${doc.file_name}
Report contents:
"""
${text}
"""
${query ? `The user asks: ${query}` : ""}

Explain in short markdown:
1. Key values found (ONLY values actually present above — never invent any).
2. What each means in plain language.
3. Values that may be worth discussing with a healthcare professional.
4. Questions the user could ask their doctor.
This is not a diagnosis.`;

    try {
      const out = await withAiFallback(async (model) => {
        const res = await generateText({ model, prompt, maxOutputTokens: 1200 });
        return res.text.trim();
      });
      if (!out) throw new Error("empty");
      return { ok: true, content: out, sources: [doc.file_name] };
    } catch (err) {
      console.error("[agent:report]", (err as Error)?.message);
      return { ok: false, content: "I couldn't analyse that report right now. Please try again." };
    }
  },
};
