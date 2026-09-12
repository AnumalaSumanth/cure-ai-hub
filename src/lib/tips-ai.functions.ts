import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { withAiFallback } from "./ai-provider.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DISCLAIMER =
  "\n\nDisclaimer: This information is educational and does not replace professional medical advice. Consult a qualified healthcare provider for personal guidance.";

const TipSchema = z.object({
  title: z.string(),
  category: z.string(),
  target_audience: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
});

type TipOutput = z.infer<typeof TipSchema>;

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(candidate);
  if (parsed) return parsed;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const slice = candidate.slice(first, last + 1);
    parsed = tryParse(slice);
    if (parsed) return parsed;
    parsed = tryParse(slice.replace(/,\s*([}\]])/g, "$1"));
    if (parsed) return parsed;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeTip(raw: unknown): TipOutput {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    title: String(r.title ?? "Health tip"),
    category: String(r.category ?? "General Wellness"),
    target_audience: String(r.target_audience ?? r.audience ?? "General audience"),
    content: String(r.content ?? r.summary ?? ""),
    tags: asStringArray(r.tags),
  };
}

export const generateTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ topic: z.string().max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { retrieveGrounding, GROUNDING_RULES, NO_GROUNDING_NOTE } = await import("./rag.server");
    const grounding = data.topic
      ? await retrieveGrounding(context.supabase, context.userId, data.topic, 3)
      : null;
    const ragContext = grounding?.used
      ? `${GROUNDING_RULES}\n${grounding.context}`
      : grounding
        ? NO_GROUNDING_NOTE
        : "";

    const prompt = `Write a professional, medically responsible health tip${
      data.topic ? ` about: ${data.topic}` : ""
    }. Keep it beginner friendly, easy to understand, non-diagnostic, and well structured.
Do not make medical claims that are not supported by the retrieved material or well-established general health guidance. Never invent citations.
${ragContext}
Return ONLY valid JSON (no markdown fences, no prose) matching:
{ "title": "string", "category": "string", "target_audience": "string", "content": "string", "tags": ["string"] }

Pick "category" from: Nutrition, Exercise, Mental Health, Sleep, Hydration, Diabetes, Heart Health, Women's Health, Children's Health, Senior Care, General Wellness.`;


    let output: TipOutput | null = null;
    try {
      output = await withAiFallback(async (model) => {
        try {
          const res = await generateText({
            model,
            output: Output.object({ schema: TipSchema }),
            prompt,
            maxOutputTokens: 2000,
          });
          return normalizeTip(res.output);
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error)) {
            const parsed = extractJsonObject(error.text ?? "");
            if (parsed) return normalizeTip(parsed);
          }
          // Plain-text JSON fallback with same model
          const { text } = await generateText({
            model,
            prompt: prompt + "\n\nRespond with ONLY the JSON object.",
            maxOutputTokens: 2000,
          });
          const parsed = extractJsonObject(text);
          if (parsed) return normalizeTip(parsed);
          throw error;
        }
      });
    } catch (err) {
      console.error("[tips-ai] generateTip failed:", (err as Error)?.message);
    }
    if (!output) {
      throw new Error("AI generation failed. Please try again.");
    }


    if (!output.content.trim()) {
      throw new Error("The AI did not return any content. Please try again.");
    }

    return {
      ...output,
      content: output.content + DISCLAIMER,
      tags: output.tags.slice(0, 8),
    };
  });

export const improveTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ content: z.string().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({
          model,
          prompt: `Rewrite the following health tip to be clearer, more engaging, grammatically correct, and easier to read, without changing its meaning or adding new medical claims. Return only the improved text with no preamble.\n\n---\n${data.content}`,
        });
        return res.text;
      });
      return { content: text.trim() };
    } catch (err) {
      console.error("[tips-ai] improveTip failed:", (err as Error)?.message);
      throw new Error("AI generation failed. Please try again.");
    }
  });


export const summarizeTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ content: z.string().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({
          model,
          prompt: `Summarize this health tip in 1-2 short sentences (max 250 characters). Return only the summary text.\n\n---\n${data.content}`,
        });
        return res.text;
      });
      return { summary: text.trim().slice(0, 300) };
    } catch (err) {
      console.error("[tips-ai] summarizeTip failed:", (err as Error)?.message);
      throw new Error("AI generation failed. Please try again.");
    }
  });

