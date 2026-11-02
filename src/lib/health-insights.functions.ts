import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHealthInsights, type HealthInsights } from "./health-insights.server";

/** Generates fresh insights from the user's own data and stores the result. */
export const generateHealthInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthInsights> => {
    const insights = await buildHealthInsights(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("health_insights")
      .insert({ user_id: context.userId, payload: insights });
    if (error) console.error("[insights] save failed:", error.message);
    return insights;
  });

/** Latest saved insights — shown on page load without any AI call. */
export const getLatestHealthInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ insights: HealthInsights | null; saved_at: string | null }> => {
    const { data, error } = await context.supabase
      .from("health_insights")
      .select("payload, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[insights] load failed:", error.message);
      return { insights: null, saved_at: null };
    }
    return { insights: data.payload as HealthInsights, saved_at: data.created_at };
  });
