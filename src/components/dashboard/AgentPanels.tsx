import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CalendarClock, CheckCircle2, Circle, FileText, Pill } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentActionCenter } from "@/lib/agent.functions";
import type { AgentActivityEntry } from "@/agents/cure-agent/types";

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Today's plan and upcoming items, built from the user's own records. */
export function AgentActionCenter() {
  const load = useServerFn(getAgentActionCenter);
  const { data, isLoading } = useQuery({
    queryKey: ["agent-action-center"],
    queryFn: () => load(),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Agent Action Center
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        )}

        {!isLoading && data && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Today's plan</p>
              {data.medicines.length === 0 && data.documents.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nothing scheduled yet. Ask me to set a medicine reminder.
                </p>
              )}
              {data.medicines.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Pill className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {m.medicine_name}
                    {m.reminder_time ? ` — ${m.reminder_time}` : ""}
                  </span>
                </div>
              ))}
              {data.documents.slice(0, 2).map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">Review {d.file_name}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Upcoming</p>
              {data.appointments.length === 0 && (
                <p className="text-xs text-muted-foreground">No upcoming appointments.</p>
              )}
              {data.appointments.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {a.doctor_name} — {a.appointment_date}
                    {a.appointment_time ? ` at ${a.appointment_time}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Step-by-step trace of what the agent did for the latest request. */
export function AgentActivityLog({ entries }: { entries: AgentActivityEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          Agent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask something and you'll see each step the agent takes here.
          </p>
        )}
        {entries.map((e, i) => (
          <div key={`${e.at}-${i}`} className="flex gap-3">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{time(e.at)}</span>
            <div className="min-w-0">
              <p className="leading-tight">{e.label}</p>
              {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
