import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles, Loader2, FileText, Pill, Activity, BookOpen, RefreshCw, TrendingUp } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  generateHealthInsights,
  getLatestHealthInsights,
} from "@/lib/health-insights.functions";
import type { InsightItem, HealthInsights } from "@/lib/health-insights.server";
import type { HealthTrend } from "@/lib/health-trends";

export const Route = createFileRoute("/_authenticated/health-insights")({
  head: () => ({
    meta: [
      { title: "AI Health Insights — Cure AI" },
      { name: "description", content: "Evidence-based observations from your health records, medicines, appointments and uploaded documents in Cure AI." },
      { property: "og:title", content: "AI Health Insights — Cure AI" },
      { property: "og:description", content: "See organised, source-backed insights from your own health information." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HealthInsightsPage,
});

type Section = {
  key: keyof Omit<HealthInsights, "generated_at" | "disclaimer" | "health_trends">;
  title: string;
  icon: typeof FileText;
};

const SECTIONS: Section[] = [
  { key: "record_observations", title: "Health Record Observations", icon: FileText },
  { key: "medication_activity", title: "Medication Activity", icon: Pill },
  { key: "health_activity", title: "Health Activity", icon: Activity },
  { key: "document_insights", title: "Document-Supported Insights", icon: BookOpen },
];

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.title}</p>
          <Badge variant="secondary">{item.category}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{item.explanation}</p>
        {item.supporting.length > 0 && (
          <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
            {item.supporting.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.source && <span>Source: {item.source}</span>}
          {item.date && <span>Information from {item.date}</span>}
          {item.link && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link to={item.link}>Open</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function trendObservation(observation: HealthTrend["observation"]) {
  switch (observation) {
    case "increased":
      return "Values increased between the two recorded reports.";
    case "decreased":
      return "Values decreased between the two recorded reports.";
    case "stable":
      return "Values were unchanged between the two recorded reports.";
    case "changed":
      return "The two recorded components changed in different directions.";
    default:
      return "Insufficient historical information for comparison.";
  }
}

function HealthTrendCard({ trend }: { trend: HealthTrend }) {
  const chartReadings = trend.unit ? trend.readings.filter(
    (reading): reading is typeof reading & { date: string; numeric_value: number } =>
      reading.date !== null && reading.numeric_value !== null,
  ) : [];
  const delta = trend.difference;
  const formatDelta = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
  const formattedDelta = delta === null
    ? null
    : `${formatDelta(delta)}${trend.secondary_difference !== null ? ` / ${formatDelta(trend.secondary_difference)}` : ""}${trend.unit ? ` ${trend.unit}` : ""}`;

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{trend.test}</h3>
            <p className="text-sm text-muted-foreground">{trend.unit ?? "Unit not recorded"}</p>
          </div>
          <Badge variant="secondary">{trend.readings.length} {trend.readings.length === 1 ? "report" : "reports"}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Previous recorded value</p>
            <p className="mt-1 font-medium">{trend.previous ? `${trend.previous.value} · ${trend.previous.date ?? "Date not recorded"}` : "Not available"}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Latest recorded value</p>
            <p className="mt-1 font-medium">{trend.latest ? `${trend.latest.value} · ${trend.latest.date ?? "Date not recorded"}` : "Not available"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{trendObservation(trend.observation)}</span>
          {formattedDelta !== null && <Badge variant="outline">Difference: {formattedDelta}</Badge>}
        </div>

        {chartReadings.length >= 2 && (
          <div aria-label={`${trend.test} historical trend chart`} className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartReadings} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} />
                <YAxis width={48} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(date) => `Report date: ${date}`} formatter={(value, name) => [`${value}${trend.unit ? ` ${trend.unit}` : ""}`, name ?? trend.test]} />
                <Line type="monotone" dataKey="numeric_value" name={trend.test} stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                {chartReadings.some((reading) => reading.secondary_numeric_value !== null) && (
                  <Line type="monotone" dataKey="secondary_numeric_value" name="Second value" stroke="var(--secondary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Source reports</p>
          {trend.readings.map((reading, index) => (
            <div key={`${reading.record_id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="min-w-0 text-muted-foreground">
                {reading.document_name} · {reading.section}{reading.page !== null ? ` · Page ${reading.page}` : ""} · {reading.date ?? "Date not recorded"}
              </span>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Link to="/health-records" search={{ recordId: reading.record_id }}>Open record</Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthTrendsSection({ trends, loading }: { trends: HealthTrend[]; loading: boolean }) {
  return (
    <section className="space-y-3" aria-labelledby="health-trends-heading">
      <div>
        <h2 id="health-trends-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" /> Health Trends &amp; Progress
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Historical measurements from your saved report analyses, arranged by report date.
        </p>
      </div>
      {loading ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading saved measurements…</CardContent></Card>
      ) : trends.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {trends.map((trend) => <HealthTrendCard key={trend.key} trend={trend} />)}
        </div>
      ) : (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No historical measurements are available in your saved health record analyses.</CardContent></Card>
      )}
    </section>
  );
}

function HealthInsightsPage() {
  const latest = useQuery({
    queryKey: ["health-insights"],
    queryFn: () => getLatestHealthInsights(),
  });

  const generate = useMutation({
    mutationFn: () => generateHealthInsights(),
  });

  const insights = generate.data ?? latest.data?.insights ?? null;
  const generatedAt = generate.data?.generated_at ?? latest.data?.saved_at ?? null;
  const loading = latest.isLoading || generate.isPending;
  const error = latest.error ?? generate.error;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">AI Health Insights</h1>
            <p className="mt-1 text-muted-foreground">
              Evidence-based observations organised from your records, medicines, appointments and uploaded documents.
            </p>
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {insights ? "Regenerate Insights" : "Generate Health Insights"}
          </Button>
        </div>

        {generatedAt && !loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Insights generated {new Date(generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}

        {loading ? (
          <div className="grid place-items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm">{generate.isPending ? "Analysing your health information…" : "Loading…"}</p>
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">
              Something went wrong while preparing your insights. Please try again.
            </CardContent>
          </Card>
        ) : !insights ? (
          <EmptyState
            icon={Sparkles}
            title="No insights yet"
            description="Generate insights to organise your health records, medication activity, appointments and uploaded documents into useful observations."
            actionLabel="Go to dashboard"
            actionTo="/dashboard"
          />
        ) : (
          <>
            <div className="space-y-6">
              {SECTIONS.map((s) => {
                const items = insights[s.key];
                const Icon = s.icon;
                return (
                  <div key={s.key} className="space-y-3">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                      <Icon className="h-4 w-4 text-primary" />
                      {s.title}
                    </h2>
                    {items.length === 0 ? (
                      <Card>
                        <CardContent className="p-4 text-sm text-muted-foreground">
                          Not enough information available.
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {items.map((i, idx) => (
                          <InsightCard key={idx} item={i} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                <p>{insights.disclaimer}</p>
                <p>
                  You can also ask the{" "}
                  <Link to="/agent" search={{ q: "Analyse my recent health information" }} className="font-medium text-primary underline-offset-2 hover:underline">
                    Cure AI Agent
                  </Link>{" "}
                  things like "Analyse my recent health information" and follow-up questions about these insights.
                </p>
              </CardContent>
            </Card>
          </>
        )}
        <HealthTrendsSection
          trends={insights?.health_trends ?? latest.data?.health_trends ?? []}
          loading={latest.isLoading}
        />
      </div>
    </DashboardLayout>
  );
}
