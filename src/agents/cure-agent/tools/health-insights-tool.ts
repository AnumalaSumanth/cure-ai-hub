import { z } from "zod";
import type { AgentTool } from "../types";
import { AGENT_DISCLAIMER } from "../safety";

/**
 * AI Health Insights for the agent. Read-only: organises the user's own saved
 * health information into observations. When a recent summary already exists
 * it is reused instead of calling the AI again (saves cost); the user can ask
 * to regenerate, or narrow the answer to one section.
 */
export const healthInsightsTool: AgentTool = {
  name: "analyze_health_information",
  description: "Analyse the user's saved health information and return AI Health Insights.",
  inputSchema: z.object({
    refresh: z.enum(["auto", "regenerate"]).default("auto"),
    topic: z.string().max(500).optional(),
  }),
  async execute(args, ctx) {
    const a = args as { refresh?: "auto" | "regenerate"; topic?: string };

    // Reuse the latest saved summary unless the user asked for a fresh one.
    if (a.refresh !== "regenerate") {
      const { data: saved } = await ctx.supabase
        .from("health_insights")
        .select("payload, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (saved?.payload) {
        const { healthInsightsToMarkdown, type HealthInsights } = await import("@/lib/health-insights.server");
        const insights = saved.payload as HealthInsights;
        return {
          ok: true,
          content: `${healthInsightsToMarkdown(insights)}\n\n_This is your latest saved summary (generated ${new Date(insights.generated_at).toLocaleString()}). Say "regenerate insights" for a fresh one._`,
          sources: ["Your saved health information"],
          data: { generated_at: insights.generated_at },
        };
      }
    }

    try {
      const { buildHealthInsights, healthInsightsToMarkdown } = await import("@/lib/health-insights.server");
      const insights = await buildHealthInsights(ctx.supabase, ctx.userId);
      await ctx.supabase.from("health_insights").insert({ user_id: ctx.userId, payload: insights });
      let content = healthInsightsToMarkdown(insights);
      const topic = (a.topic ?? "").toLowerCase();
      const sectionFor = (re: RegExp, items: typeof insights.record_observations) =>
        items.length ? items.map((i) => `- **${i.title}** — ${i.explanation}${i.source ? ` _(Source: ${i.source})_` : ""}`).join("\n") : "Not enough information available.";
      if (/\b(medicine|medication|adherence|dose)\b/.test(topic)) {
        content = `### Medication Activity\n${sectionFor(/./, insights.medication_activity)}\n\n_${insights.disclaimer}_`;
      } else if (/\b(document|library|upload)\b/.test(topic)) {
        content = `### Document-Supported Insights\n${sectionFor(/./, insights.document_insights)}\n\n_${insights.disclaimer}_`;
      } else if (/\b(appointment|activity|timeline)\b/.test(topic)) {
        content = `### Health Activity\n${sectionFor(/./, insights.health_activity)}\n\n_${insights.disclaimer}_`;
      }
      return { ok: true, content, sources: ["Your saved health information"] };
    } catch (err) {
      console.error("[agent:insights]", (err as Error)?.message);
      return {
        ok: false,
        content: `I couldn't build your health insights right now. Please try again. ${AGENT_DISCLAIMER}`,
      };
    }
  },
};
