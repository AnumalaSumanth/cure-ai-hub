import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
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

export type StudyPlanDay = z.infer<typeof DaySchema>;
export type StudyPlanResult = {
  days: StudyPlanDay[];
  tip: string;
};

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

Generate a structured, personalized study plan.

Subject: ${data.subject}
Topic: ${data.topic}
Difficulty: ${data.difficulty}
Available study time per day: ${data.daily_hours} hours
Total days: ${data.days}
${examLine}

Rules:
- Organize output day by day (Day 1, Day 2, ...), exactly ${data.days} days.
- Each day must contain: topics to study, key concepts to focus on, one revision task, and a practice questions or quiz task.
- Match depth/pace to difficulty (${data.difficulty}).
- Keep each day realistic for ${data.daily_hours} hours.
- Use simple, clear, student-friendly language.
- Do NOT provide medical diagnosis, treatment, or patient-specific clinical advice.
- End with ONE short revision or exam-preparation tip.`;

    const { output } = await generateText({
      model: gateway(MODEL),
      output: Output.object({
        schema: z.object({
          days: z.array(DaySchema),
          tip: z.string(),
        }),
      }),
      prompt,
    });

    return {
      days: output.days.slice(0, data.days).map((d, i) => ({ ...d, day: i + 1 })),
      tip: output.tip.trim(),
    };
  });
