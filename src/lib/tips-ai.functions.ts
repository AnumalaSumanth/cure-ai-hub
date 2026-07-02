import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3-flash-preview";
const DISCLAIMER =
  "\n\nDisclaimer: This information is educational and does not replace professional medical advice. Consult a qualified healthcare provider for personal guidance.";

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const generateTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ topic: z.string().max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const prompt = `Write a professional, medically responsible health tip${
      data.topic ? ` about: ${data.topic}` : ""
    }. Keep it beginner friendly, easy to understand, non-diagnostic, and well structured. Pick a category from: Nutrition, Exercise, Mental Health, Sleep, Hydration, Diabetes, Heart Health, Women's Health, Children's Health, Senior Care, General Wellness.`;

    const { output } = await generateText({
      model: gateway(MODEL),
      output: Output.object({
        schema: z.object({
          title: z.string(),
          category: z.string(),
          target_audience: z.string(),
          content: z.string(),
          tags: z.array(z.string()),
        }),
      }),
      prompt,
    });

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
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `Rewrite the following health tip to be clearer, more engaging, grammatically correct, and easier to read, without changing its meaning or adding new medical claims. Return only the improved text with no preamble.\n\n---\n${data.content}`,
    });
    return { content: text.trim() };
  });

export const summarizeTip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ content: z.string().min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const { text } = await generateText({
      model: gateway(MODEL),
      prompt: `Summarize this health tip in 1-2 short sentences (max 250 characters). Return only the summary text.\n\n---\n${data.content}`,
    });
    return { summary: text.trim().slice(0, 300) };
  });
