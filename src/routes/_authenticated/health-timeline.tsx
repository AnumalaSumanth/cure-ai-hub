import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, FileText, Pill, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/health-timeline")({
  head: () => ({
    meta: [
      { title: "Health Timeline — Cure AI" },
      { name: "description", content: "One chronological view of your appointments, medicines, health records and AI analyses in Cure AI." },
      { property: "og:title", content: "Health Timeline — Cure AI" },
      { property: "og:description", content: "See every health event in one chronological timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HealthTimelinePage,
});

type Category = "records" | "medicines" | "appointments" | "analysis";

type TimelineEvent = {
  id: string;
  at: Date;
  category: Category;
  title: string;
  description: string;
  status?: string;
  to: string;
};

const META: Record<Category, { label: string; icon: typeof Calendar; tone: string }> = {
  appointments: { label: "Appointment", icon: Calendar, tone: "bg-primary/10 text-primary" },
  medicines: { label: "Medicine", icon: Pill, tone: "bg-emerald-500/10 text-emerald-600" },
  records: { label: "Health Record", icon: FileText, tone: "bg-blue-500/10 text-blue-600" },
  analysis: { label: "AI Analysis", icon: Activity, tone: "bg-amber-500/10 text-amber-600" },
};

const FILTERS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "records", label: "Health Records" },
  { key: "medicines", label: "Medicines" },
  { key: "appointments", label: "Appointments" },
  { key: "analysis", label: "AI Analysis" },
];

function dayLabel(d: Date) {
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function HealthTimelinePage() {
  const [filter, setFilter] = useState<"all" | Category>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["health-timeline"],
    queryFn: async () => {
      const [appts, records, analyses, doses] = await Promise.all([
        supabase.from("appointments").select("id, doctor_name, hospital_name, appointment_date, appointment_time, status").order("appointment_date", { ascending: false }).limit(30),
        supabase.from("health_records").select("id, title, record_type, record_date, uploaded_at").order("uploaded_at", { ascending: false }).limit(30),
        supabase.from("health_record_analyses").select("id, record_id, summary, created_at").order("created_at", { ascending: false }).limit(30),
        supabase.from("medicine_doses").select("id, medicine_id, scheduled_date, scheduled_time, status, medicines(medicine_name)").order("scheduled_date", { ascending: false }).limit(40),
      ]);

      const events: TimelineEvent[] = [];

      for (const a of appts.data ?? []) {
        events.push({
          id: `appt-${a.id}`,
          at: new Date(`${a.appointment_date}T${a.appointment_time ?? "09:00"}`),
          category: "appointments",
          title: `Appointment with ${a.doctor_name}`,
          description: a.hospital_name ?? "Doctor visit",
          status: appointmentStatus(a),
          to: "/appointments",
        });
      }
      for (const r of records.data ?? []) {
        events.push({
          id: `rec-${r.id}`,
          at: new Date(r.record_date ? `${r.record_date}T09:00` : r.uploaded_at),
          category: "records",
          title: r.title,
          description: r.record_type ? `${r.record_type} added to your records` : "Health record added",
          to: "/health-records",
        });
      }
      for (const an of analyses.data ?? []) {
        events.push({
          id: `an-${an.id}`,
          at: new Date(an.created_at),
          category: "analysis",
          title: "Health record analysed with AI",
          description: (an.summary ?? "AI analysis saved").slice(0, 140),
          to: "/health-records",
        });
      }
      for (const d of doses.data ?? []) {
        const name = (d as { medicines?: { medicine_name?: string } | null }).medicines?.medicine_name ?? "Medicine";
        events.push({
          id: `dose-${d.id}`,
          at: new Date(`${d.scheduled_date}T${d.scheduled_time}`),
          category: "medicines",
          title: name,
          description: `Dose scheduled for ${d.scheduled_time.slice(0, 5)}`,
          status: d.status,
          to: "/medicines",
        });
      }

      return events
        .filter((e) => !Number.isNaN(e.at.getTime()))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 80);
    },
  });

  const grouped = useMemo(() => {
    const list = (data ?? []).filter((e) => filter === "all" || e.category === filter);
    const map = new Map<string, TimelineEvent[]>();
    for (const e of list) {
      const key = dayLabel(e.at);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [data, filter]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Health Timeline</h1>
          <p className="mt-1 text-muted-foreground">Every health event from your records, medicines and appointments in one place.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No timeline events yet"
            description="Add an appointment, medicine or health record and it will appear here automatically."
            actionLabel="Go to dashboard"
            actionTo="/dashboard"
          />
        ) : (
          <div className="space-y-8">
            {grouped.map(([day, events]) => (
              <div key={day}>
                <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">{day}</h2>
                <div className="relative space-y-3 border-l border-border pl-6">
                  {events.map((e) => {
                    const meta = META[e.category];
                    const Icon = meta.icon;
                    return (
                      <Card key={e.id} className="shadow-soft">
                        <CardContent className="flex flex-wrap items-start gap-3 p-4">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${meta.tone}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{e.title}</p>
                              <Badge variant="secondary">{meta.label}</Badge>
                              {e.status && <Badge variant="outline">{e.status}</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {e.at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                          </div>
                          <Button asChild variant="ghost" size="sm">
                            <Link to={e.to}>Open</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
