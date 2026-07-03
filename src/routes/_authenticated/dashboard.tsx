import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Pill,
  Calendar,
  FileText,
  Plus,
  Upload,
  UserCog,
  ArrowRight,
  Lightbulb,
  Sparkles,
  Star,
  Clock,
  Activity,
  PencilLine,
  CalendarPlus,
  FilePlus,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cure AI" }] }),
  component: DashboardPage,
});

const RECENT_DAYS = 7;

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [tipsRes, medsRes, apptsRes, recsRes, upcomingRes] = await Promise.all([
        supabase
          .from("tips")
          .select("id,title,category,status,is_featured,ai_summary,created_at,updated_at")
          .order("updated_at", { ascending: false }),
        supabase.from("medicines").select("id,medicine_name,created_at").order("created_at", { ascending: false }),
        supabase.from("appointments").select("id,doctor_name,hospital_name,appointment_date,appointment_time,status,created_at").order("created_at", { ascending: false }),
        supabase.from("health_records").select("id,title,uploaded_at").order("uploaded_at", { ascending: false }),
        supabase
          .from("appointments")
          .select("id,doctor_name,hospital_name,appointment_date,appointment_time")
          .eq("status", "upcoming")
          .order("appointment_date", { ascending: true })
          .limit(5),
      ]);
      if (tipsRes.error) throw tipsRes.error;
      const tips = tipsRes.data ?? [];
      const meds = medsRes.data ?? [];
      const appts = apptsRes.data ?? [];
      const recs = recsRes.data ?? [];

      const recentTips = tips.filter((t) => t.created_at >= since).length;
      const aiGenerated = tips.filter((t) => t.ai_summary && t.ai_summary.trim().length > 0).length;
      const featured = tips.filter((t) => t.is_featured).length;
      const published = tips.filter((t) => t.status === "Published").length;

      // Activity feed from timestamps across owned rows
      type ActivityItem = {
        id: string;
        kind: "tip_created" | "tip_updated" | "tip_featured" | "tip_ai" | "medicine" | "appointment" | "record";
        title: string;
        subtitle?: string;
        at: string;
        to?: string;
        params?: Record<string, string>;
      };
      const activity: ActivityItem[] = [];
      for (const t of tips) {
        activity.push({
          id: `tip-c-${t.id}`,
          kind: "tip_created",
          title: t.title,
          subtitle: t.category ?? "Health tip created",
          at: t.created_at,
          to: "/health-tips/$id",
          params: { id: t.id },
        });
        if (t.updated_at && t.updated_at !== t.created_at) {
          activity.push({
            id: `tip-u-${t.id}`,
            kind: t.is_featured ? "tip_featured" : t.ai_summary ? "tip_ai" : "tip_updated",
            title: t.title,
            subtitle: t.is_featured ? "Marked as featured" : t.ai_summary ? "AI summary generated" : "Tip updated",
            at: t.updated_at,
            to: "/health-tips/$id",
            params: { id: t.id },
          });
        }
      }
      for (const m of meds) {
        activity.push({ id: `med-${m.id}`, kind: "medicine", title: m.medicine_name, subtitle: "Medicine added", at: m.created_at, to: "/medicines" });
      }
      for (const a of appts) {
        activity.push({ id: `appt-${a.id}`, kind: "appointment", title: a.doctor_name, subtitle: a.hospital_name ?? "Appointment added", at: a.created_at, to: "/appointments" });
      }
      for (const r of recs) {
        activity.push({ id: `rec-${r.id}`, kind: "record", title: r.title, subtitle: "Health record uploaded", at: r.uploaded_at, to: "/health-records" });
      }
      activity.sort((a, b) => b.at.localeCompare(a.at));

      return {
        counts: {
          tips: tips.length,
          aiGenerated,
          recentTips,
          featured,
          published,
          medicines: meds.length,
          appointments: (upcomingRes.data ?? []).length,
          records: recs.length,
        },
        recentTips: tips
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5),
        upcoming: upcomingRes.data ?? [],
        activity: activity.slice(0, 8),
      };
    },
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function activityIcon(kind: string) {
  switch (kind) {
    case "tip_created": return Lightbulb;
    case "tip_updated": return PencilLine;
    case "tip_featured": return Star;
    case "tip_ai": return Sparkles;
    case "medicine": return Pill;
    case "appointment": return CalendarPlus;
    case "record": return FilePlus;
    default: return Activity;
  }
}

function DashboardPage() {
  const { user } = useUser();
  const { data, isLoading } = useDashboardData();

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "there";

  const stats = [
    { label: "Health Tips", value: data?.counts.tips ?? 0, icon: Lightbulb, color: "bg-primary/10 text-primary", to: "/health-tips" },
    { label: "AI-Generated", value: data?.counts.aiGenerated ?? 0, icon: Sparkles, color: "bg-secondary/10 text-secondary", to: "/health-tips" },
    { label: `Added (${RECENT_DAYS}d)`, value: data?.counts.recentTips ?? 0, icon: Clock, color: "bg-success/10 text-success", to: "/health-tips" },
    { label: "Featured Tips", value: data?.counts.featured ?? 0, icon: Star, color: "bg-warning/15 text-warning", to: "/health-tips" },
    { label: "Medicines", value: data?.counts.medicines ?? 0, icon: Pill, color: "bg-primary/10 text-primary", to: "/medicines" },
    { label: "Upcoming Appts", value: data?.counts.appointments ?? 0, icon: Calendar, color: "bg-secondary/10 text-secondary", to: "/appointments" },
    { label: "Health Records", value: data?.counts.records ?? 0, icon: FileText, color: "bg-warning/15 text-warning", to: "/health-records" },
    { label: "Published Tips", value: data?.counts.published ?? 0, icon: Activity, color: "bg-success/10 text-success", to: "/health-tips" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Welcome back, {name} 👋</h1>
          <p className="mt-1 text-muted-foreground">Here's a quick look at your health today.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))
            : stats.map((s) => (
                <Link key={s.label} to={s.to} className="group">
                  <Card className="shadow-soft transition-all group-hover:-translate-y-0.5 group-hover:shadow-card">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.color}`}>
                          <s.icon className="h-5 w-5" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                      <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/health-tips/new"><Plus className="h-4 w-4" /> New health tip</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/medicines"><Plus className="h-4 w-4" /> Add medicine</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/appointments"><Plus className="h-4 w-4" /> Add appointment</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/health-records"><Upload className="h-4 w-4" /> Upload record</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display">Recent health tips</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/health-tips">View all</Link></Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : data && data.recentTips.length > 0 ? (
                <div className="divide-y divide-border">
                  {data.recentTips.map((t) => (
                    <Link
                      key={t.id}
                      to="/health-tips/$id"
                      params={{ id: t.id }}
                      className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{t.title}</p>
                          {t.is_featured && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.ai_summary ?? t.category ?? "Health tip"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={t.status === "Published" ? "default" : t.status === "Archived" ? "outline" : "secondary"}>
                          {t.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(t.created_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Lightbulb}
                  title="No health tips yet"
                  description="Create your first tip to start building your personal knowledge library."
                  actionLabel="Create Health Tip"
                  actionTo="/health-tips/new"
                />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display">Upcoming appointments</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/appointments">View all</Link></Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : data && data.upcoming.length > 0 ? (
                <div className="divide-y divide-border">
                  {data.upcoming.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{a.doctor_name}</p>
                        <p className="text-xs text-muted-foreground">{a.hospital_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{a.appointment_date}</p>
                        <Badge variant="secondary" className="mt-1">{a.appointment_time ?? "—"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No upcoming appointments yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Latest activity</CardTitle>
            <span className="text-xs text-muted-foreground">From your recent records</span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : data && data.activity.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.activity.map((a) => {
                  const Icon = activityIcon(a.kind);
                  const content = (
                    <div className="flex items-center gap-3 py-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.at)}</span>
                    </div>
                  );
                  return (
                    <li key={a.id}>
                      {a.to && a.params ? (
                        <Link to={a.to} params={a.params} className="block transition-colors hover:bg-muted/40">
                          {content}
                        </Link>
                      ) : a.to ? (
                        <Link to={a.to} className="block transition-colors hover:bg-muted/40">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No recent activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
