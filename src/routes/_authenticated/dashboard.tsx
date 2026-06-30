import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Pill,
  Calendar,
  FileText,
  Activity,
  Plus,
  Upload,
  UserCog,
  ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cure AI" }] }),
  component: DashboardPage,
});

function useDashboardCounts() {
  return useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [meds, appts, recs] = await Promise.all([
        supabase.from("medicines").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "upcoming"),
        supabase.from("health_records").select("id", { count: "exact", head: true }),
      ]);
      return {
        medicines: meds.count ?? 0,
        appointments: appts.count ?? 0,
        records: recs.count ?? 0,
      };
    },
  });
}

function useUpcoming() {
  return useQuery({
    queryKey: ["upcoming-appointments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("status", "upcoming")
        .order("appointment_date", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });
}

function DashboardPage() {
  const { user } = useUser();
  const { data: counts } = useDashboardCounts();
  const { data: upcoming } = useUpcoming();

  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "there";

  const stats = [
    { label: "Medicines", value: counts?.medicines ?? 0, icon: Pill, color: "bg-primary/10 text-primary", to: "/medicines" },
    { label: "Upcoming Appointments", value: counts?.appointments ?? 0, icon: Calendar, color: "bg-secondary/10 text-secondary", to: "/appointments" },
    { label: "Health Records", value: counts?.records ?? 0, icon: FileText, color: "bg-warning/15 text-warning", to: "/health-records" },
    { label: "Recent Activity", value: "—", icon: Activity, color: "bg-success/10 text-success", to: "/dashboard" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Welcome back, {name} 👋</h1>
          <p className="mt-1 text-muted-foreground">Here's a quick look at your health today.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
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
              <Link to="/medicines"><Plus className="h-4 w-4" /> Add medicine</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/appointments"><Plus className="h-4 w-4" /> Add appointment</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/health-records"><Upload className="h-4 w-4" /> Upload record</Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
              <Link to="/profile"><UserCog className="h-4 w-4" /> Edit profile</Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display">Upcoming appointments</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/appointments">View all</Link></Button>
            </CardHeader>
            <CardContent>
              {upcoming && upcoming.length > 0 ? (
                <div className="divide-y divide-border">
                  {upcoming.map((a) => (
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
                <p className="py-6 text-center text-sm text-muted-foreground">No upcoming appointments yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="font-display">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3"><Activity className="h-4 w-4 text-primary" /> Account created</li>
                <li className="flex items-center gap-3"><UserCog className="h-4 w-4 text-primary" /> Set up your health profile to see more activity here</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
