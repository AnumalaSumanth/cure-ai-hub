import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "./ai-provider.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DISCLAIMER = "This is not a medical diagnosis.";

export type ImageAnalysisResult = {
  possible_conditions: string[];
  severity: "low" | "medium" | "high";
  self_care: string[];
  warning_signs: string[];
  doctor_recommendation: string;
  summary: string;
  disclaimer: string;
};

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
    parsed = tryParse(slice) ?? tryParse(slice.replace(/,\s*([}\]])/g, "$1"));
    if (parsed) return parsed;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalize(raw: unknown): ImageAnalysisResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const sev = String(r.severity ?? "low").toLowerCase();
  return {
    possible_conditions: asStringArray(r.possible_conditions ?? r.conditions),
    severity: sev === "high" ? "high" : sev === "medium" ? "medium" : "low",
    self_care: asStringArray(r.self_care ?? r.self_care_suggestions),
    warning_signs: asStringArray(r.warning_signs),
    doctor_recommendation: String(
      r.doctor_recommendation ?? r.consult_doctor ?? "Consider consulting a healthcare professional.",
    ),
    summary: String(r.summary ?? ""),
    disclaimer: DISCLAIMER,
  };
}

export const analyzeHealthImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .regex(/^data:image\/(png|jpe?g|webp|heic|heif);base64,/i, "Unsupported image format"),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ImageAnalysisResult> => {
    const prompt = `Look at this photo of a visible skin/wound/rash concern and give cautious, educational guidance.
${data.note ? `User note: ${data.note}\n` : ""}
Never claim certainty or give a diagnosis. Use hedged wording ("may be consistent with").
If it appears severe (deep wound, spreading infection, necrosis, large burn, heavy bleeding, signs of systemic illness), set severity "high" and advise immediate medical attention.

Return ONLY valid JSON (no markdown fences, no prose) matching:
{
  "summary": "string, 1-2 cautious sentences",
  "possible_conditions": ["string"],
  "severity": "low" | "medium" | "high",
  "self_care": ["string"],
  "warning_signs": ["string"],
  "doctor_recommendation": "string"
}`;

    try {
      const text = await withAiFallback(async (model) => {
        const res = await generateText({
          model,
          system: MEDICAL_SAFETY_SYSTEM,
          maxOutputTokens: 1200,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: data.imageDataUrl },
              ],
            },
          ],
        });
        return res.text;
      });

      const parsed = extractJsonObject(text);
      if (!parsed) throw new Error("unparseable");
      return normalize(parsed);
    } catch (err) {
      console.error("[image-analysis] failed:", (err as Error)?.message);
      throw new Error("Image analysis failed. Please try again with a clearer photo.");
    }
  });
