import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3-flash-preview";

const InputSchema = z.object({
  subject: z.string().min(1).max(200),
  topic: z.string().min(1).max(500),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  daily_hours: z.number().min(0.5).max(16),
  days: z.number().int().min(1).max(30),
  exam_date: z.string().optional().nullable(),
});

const DaySchema = z.object({
  day: z.number().int(),
  focus: z.string(),
  topics: z.array(z.string()),
  key_concepts: z.array(z.string()),
  revision_task: z.string(),
  practice: z.string(),
});

const PlanSchema = z.object({
  days: z.array(DaySchema),
  tip: z.string(),
});

export type StudyPlanDay = z.infer<typeof DaySchema>;
export type StudyPlanResult = {
  days: StudyPlanDay[];
  tip: string;
};

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function coerceDay(raw: unknown, index: number): StudyPlanDay {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    day: Number(r.day) || index + 1,
    focus: String(r.focus ?? r.title ?? `Day ${index + 1}`),
    topics: asStringArray(r.topics ?? r.topics_to_study),
    key_concepts: asStringArray(r.key_concepts ?? r.keyConcepts ?? r.concepts),
    revision_task: String(r.revision_task ?? r.revision ?? ""),
    practice: String(r.practice ?? r.practice_questions ?? r.quiz ?? ""),
  };
}

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  // Strip markdown code fences
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
  // Find first { ... last }
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const slice = candidate.slice(first, last + 1);
    parsed = tryParse(slice);
    if (parsed) return parsed;
    // Remove trailing commas
    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    parsed = tryParse(repaired);
    if (parsed) return parsed;
  }
  return null;
}

function normalize(raw: unknown, requestedDays: number): StudyPlanResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const daysArr = Array.isArray(obj.days) ? obj.days : [];
  const days = daysArr
    .slice(0, requestedDays)
    .map((d, i) => ({ ...coerceDay(d, i), day: i + 1 }));
  return {
    days,
    tip: String(obj.tip ?? "").trim(),
  };
}

export const generateStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<StudyPlanResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const examLine = data.exam_date
      ? `Exam date: ${data.exam_date}. Prioritize the most important, high-yield concepts as the exam approaches.`
      : "No fixed exam date; aim for solid understanding.";

    const prompt = `You are Curo Study AI, an expert learning assistant for medical and healthcare students.

Generate a structured, personalized study plan as JSON.

Subject: ${data.subject}
Topic: ${data.topic}
Difficulty: ${data.difficulty}
Available study time per day: ${data.daily_hours} hours
Total days: ${data.days}
${examLine}

Return ONLY valid JSON matching this shape (no prose, no markdown fences):
{
  "days": [
    { "day": 1, "focus": "string", "topics": ["string"], "key_concepts": ["string"], "revision_task": "string", "practice": "string" }
  ],
  "tip": "string"
}

Rules:
- Produce exactly ${data.days} day entries.
- Match depth to difficulty (${data.difficulty}) and keep each day realistic for ${data.daily_hours} hours.
- Use clear student-friendly language.
- Do NOT provide medical diagnosis, treatment, or patient-specific clinical advice.
- End with ONE short revision or exam-preparation tip in the "tip" field.`;

    try {
      const { output } = await generateText({
        model: gateway(MODEL),
        output: Output.object({ schema: PlanSchema }),
        prompt,
      });
      const normalized = normalize(output, data.days);
      if (normalized.days.length === 0) throw new Error("empty");
      return normalized;
    } catch (error) {
      // Fallback: parse raw model text when schema validation fails
      if (NoObjectGeneratedError.isInstance(error)) {
        const parsed = extractJsonObject(error.text ?? "");
        if (parsed) {
          const normalized = normalize(parsed, data.days);
          if (normalized.days.length > 0) return normalized;
        }
      }
      // Last resort: plain-text generation, then parse
      try {
        const { text } = await generateText({
          model: gateway(MODEL),
          prompt: prompt + "\n\nRespond with ONLY the JSON object.",
        });
        const parsed = extractJsonObject(text);
        if (parsed) {
          const normalized = normalize(parsed, data.days);
          if (normalized.days.length > 0) return normalized;
        }
      } catch {
        // ignore, fall through to friendly error
      }
      throw new Error(
        "The AI response could not be parsed into a study plan. Please try again.",
      );
    }
  });
