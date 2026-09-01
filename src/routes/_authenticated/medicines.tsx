import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pill,
  Plus,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  CalendarDays,
  Pencil,
  Eye,
  Bell,
  Sparkles,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/medicines")({
  head: () => ({
    meta: [
      { title: "Medicines — Cure AI" },
      { name: "description", content: "Manage your medicines, schedules, doses and reminders in Cure AI." },
    ],
  }),
  component: MedicinesPage,
});

/* ---------------- types & helpers ---------------- */

type Medicine = {
  id: string;
  medicine_name: string;
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  times: string[] | null;
  reminder_time: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  reminder_app: boolean;
  reminder_email: boolean;
  reminder_sms: boolean;
  reminder_lead_minutes: number;
  created_at: string;
};

type Dose = {
  id: string;
  medicine_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  taken_at: string | null;
};

const FREQUENCIES = [
  { value: "Once daily", slots: 1, defaults: ["09:00"] },
  { value: "Twice daily", slots: 2, defaults: ["09:00", "21:00"] },
  { value: "Three times daily", slots: 3, defaults: ["08:00", "14:00", "20:00"] },
  { value: "Four times daily", slots: 4, defaults: ["08:00", "12:00", "16:00", "20:00"] },
  { value: "Custom", slots: 0, defaults: ["09:00"] },
] as const;

function slotsFor(freq: string): number {
  return FREQUENCIES.find((f) => f.value === freq)?.slots ?? 0;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "09:30:00" | "09:30" -> "9:30 AM" */
function prettyTime(t: string | null | undefined): string {
  if (!t) return "—";
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mRaw ?? "00"} ${suffix}`;
}

function hhmm(t: string): string {
  return t.slice(0, 5);
}

function medTimes(m: Medicine): string[] {
  const list = (m.times ?? []).filter(Boolean).map(hhmm);
  if (list.length > 0) return [...list].sort();
  return m.reminder_time ? [hhmm(m.reminder_time)] : [];
}

function isActive(m: Medicine, date = todayISO()): boolean {
  if (m.start_date && m.start_date > date) return false;
  if (m.end_date && m.end_date < date) return false;
  return true;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const MISSED_GRACE_MIN = 60;

function doseStatus(time: string, logged?: Dose): "taken" | "skipped" | "missed" | "upcoming" {
  if (logged) {
    if (logged.status === "taken") return "taken";
    if (logged.status === "skipped") return "skipped";
    if (logged.status === "missed") return "missed";
  }
  const [h, m] = time.split(":").map(Number);
  const mins = (h ?? 0) * 60 + (m ?? 0);
  const [nh, nm] = nowHHMM().split(":").map(Number);
  const nowMins = (nh ?? 0) * 60 + (nm ?? 0);
  return nowMins > mins + MISSED_GRACE_MIN ? "missed" : "upcoming";
}

function statusBadge(status: string) {
  switch (status) {
    case "taken":
      return <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Taken</Badge>;
    case "missed":
      return <Badge variant="destructive">Missed</Badge>;
    case "skipped":
      return <Badge variant="outline">Skipped</Badge>;
    default:
      return <Badge variant="secondary">Upcoming</Badge>;
  }
}

/* ---------------- page ---------------- */

function MedicinesPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [details, setDetails] = useState<Medicine | null>(null);
  const [toDelete, setToDelete] = useState<Medicine | null>(null);
  const [busyDose, setBusyDose] = useState<string | null>(null);

  const { data: meds, isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Medicine[];
    },
  });

  const { data: doses } = useQuery({
    queryKey: ["medicine-doses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicine_doses")
        .select("id,medicine_id,scheduled_date,scheduled_time,status,taken_at")
        .gte("scheduled_date", isoDaysAgo(29));
      if (error) throw error;
      return (data ?? []) as unknown as Dose[];
    },
  });

  const today = todayISO();
  const doseKey = (medId: string, date: string, time: string) => `${medId}|${date}|${hhmm(time)}`;

  const doseMap = useMemo(() => {
    const map = new Map<string, Dose>();
    for (const d of doses ?? []) map.set(doseKey(d.medicine_id, d.scheduled_date, d.scheduled_time), d);
    return map;
  }, [doses]);

  const activeMeds = useMemo(() => (meds ?? []).filter((m) => isActive(m)), [meds]);

  const todaySchedule = useMemo(() => {
    const rows = activeMeds.flatMap((m) =>
      medTimes(m).map((t) => {
        const logged = doseMap.get(doseKey(m.id, today, t));
        return { med: m, time: t, status: doseStatus(t, logged), logged };
      }),
    );
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }, [activeMeds, doseMap, today]);

  const week = useMemo(() => {
    const days: { date: string; scheduled: number; taken: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = isoDaysAgo(i);
      let scheduled = 0;
      let taken = 0;
      for (const m of meds ?? []) {
        if (!isActive(m, date)) continue;
        for (const t of medTimes(m)) {
          if (date === today) {
            const st = doseStatus(t, doseMap.get(doseKey(m.id, date, t)));
            if (st === "upcoming") continue;
          }
          scheduled += 1;
          if (doseMap.get(doseKey(m.id, date, t))?.status === "taken") taken += 1;
        }
      }
      days.push({ date, scheduled, taken });
    }
    const totalScheduled = days.reduce((s, d) => s + d.scheduled, 0);
    const totalTaken = days.reduce((s, d) => s + d.taken, 0);
    const pct = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : null;
    return { days, totalScheduled, totalTaken, pct };
  }, [meds, doseMap, today]);

  const summary = {
    active: activeMeds.length,
    todayDoses: todaySchedule.length,
    upcoming: todaySchedule.filter((d) => d.status === "upcoming").length,
    adherence: week.pct,
  };

  async function markDose(medId: string, time: string, status: "taken" | "skipped") {
    if (!user) return;
    setBusyDose(`${medId}|${time}`);
    const { error } = await supabase.from("medicine_doses").upsert(
      {
        user_id: user.id,
        medicine_id: medId,
        scheduled_date: today,
        scheduled_time: `${time}:00`,
        status,
        taken_at: status === "taken" ? new Date().toISOString() : null,
      } as never,
      { onConflict: "medicine_id,scheduled_date,scheduled_time" },
    );
    setBusyDose(null);
    if (error) return toast.error(error.message);
    toast.success(status === "taken" ? "Dose marked as taken" : "Dose skipped");
    qc.invalidateQueries({ queryKey: ["medicine-doses"] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from("medicines").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) return toast.error(error.message);
    toast.success("Medicine removed");
    qc.invalidateQueries({ queryKey: ["medicines"] });
    qc.invalidateQueries({ queryKey: ["medicine-doses"] });
    qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
  }

  const stats = [
    { label: "Active Medicines", value: summary.active, icon: Pill, color: "bg-primary/10 text-primary" },
    { label: "Today's Doses", value: summary.todayDoses, icon: CalendarDays, color: "bg-secondary/10 text-secondary" },
    { label: "Upcoming Doses", value: summary.upcoming, icon: Clock, color: "bg-warning/15 text-warning" },
    {
      label: "Medication Adherence",
      value: summary.adherence === null ? "—" : `${summary.adherence}%`,
      icon: Activity,
      color: "bg-primary/10 text-primary",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Medicines</h1>
            <p className="mt-1 text-muted-foreground">Manage your medicines, schedules, and reminders.</p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add medicine
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
            : stats.map((s) => (
                <Card key={s.label} className="shadow-soft">
                  <CardContent className="p-5">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.color}`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Today's schedule */}
        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Today's Schedule</CardTitle>
            <span className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : todaySchedule.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No doses scheduled for today. Add a medicine with scheduled times to see them here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {todaySchedule.map((row) => (
                  <li
                    key={`${row.med.id}-${row.time}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.med.medicine_name}
                          {row.med.strength ? ` ${row.med.strength}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {prettyTime(row.time)}
                          {row.med.frequency ? ` · ${row.med.frequency}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(row.status)}
                      {(row.status === "upcoming" || row.status === "missed") && (
                        <>
                          <Button
                            size="sm"
                            disabled={busyDose === `${row.med.id}|${row.time}`}
                            onClick={() => markDose(row.med.id, row.time, "taken")}
                          >
                            {busyDose === `${row.med.id}|${row.time}` ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                            )}
                            Mark as taken
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markDose(row.med.id, row.time, "skipped")}
                            aria-label="Skip dose"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Weekly adherence */}
        <Card className="shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display">Weekly adherence</CardTitle>
            <span className="text-sm font-medium">
              {week.pct === null ? "No completed doses yet" : `${week.pct}% · ${week.totalTaken}/${week.totalScheduled}`}
            </span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {week.days.map((d) => {
                const ratio = d.scheduled > 0 ? d.taken / d.scheduled : null;
                const tone =
                  ratio === null
                    ? "bg-muted text-muted-foreground"
                    : ratio >= 0.8
                      ? "bg-primary/15 text-primary"
                      : ratio > 0
                        ? "bg-warning/20 text-warning"
                        : "bg-destructive/15 text-destructive";
                return (
                  <div key={d.date} className={`rounded-lg p-2 text-center ${tone}`}>
                    <p className="text-[10px] uppercase">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                    </p>
                    <p className="mt-1 text-xs font-semibold">{d.scheduled === 0 ? "—" : `${d.taken}/${d.scheduled}`}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* My medicines */}
        <div className="space-y-4">
          <h2 className="font-display text-xl font-semibold">My Medicines</h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full rounded-xl" />
              ))}
            </div>
          ) : !meds || meds.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No medicines yet"
              description="Add your first medicine to keep track of strengths, schedules and reminders."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {meds.map((m) => {
                const times = medTimes(m);
                const active = isActive(m);
                return (
                  <Card key={m.id} className="shadow-soft">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Pill className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {m.medicine_name}
                              {m.strength ? ` ${m.strength}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">{m.frequency ?? "No frequency set"}</p>
                          </div>
                        </div>
                        <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Completed"}</Badge>
                      </div>

                      <p className="text-sm">
                        {times.length > 0 ? times.map(prettyTime).join(" · ") : "No times scheduled"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.start_date} → {m.end_date ?? "ongoing"}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setDetails(m)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(m);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(m)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Cure AI is a healthcare assistance tool, not a replacement for your doctor. It never prescribes medicines or
          changes dosages — always follow your prescriber's instructions.
        </p>
      </div>

      <MedicineFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        medicine={editing}
        userId={user?.id}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["medicines"] });
          qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
        }}
      />

      <MedicineDetailsDialog
        medicine={details}
        doses={doses ?? []}
        onOpenChange={(o) => !o && setDetails(null)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this medicine?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.medicine_name} and its dose history will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

/* ---------------- add / edit form ---------------- */

function MedicineFormDialog({
  open,
  onOpenChange,
  medicine,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine: Medicine | null;
  userId: string | undefined;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [frequency, setFrequency] = useState("Once daily");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [remApp, setRemApp] = useState(true);
  const [remEmail, setRemEmail] = useState(false);
  const [remSms, setRemSms] = useState(false);
  const [lead, setLead] = useState("15");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // sync form state with the dialog target
  const key = open ? (medicine?.id ?? "new") : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (open) {
      setName(medicine?.medicine_name ?? "");
      setStrength(medicine?.strength ?? medicine?.dosage ?? "");
      const f = medicine?.frequency && FREQUENCIES.some((x) => x.value === medicine.frequency)
        ? medicine.frequency
        : medicine
          ? "Custom"
          : "Once daily";
      setFrequency(f);
      const t = medicine ? medTimes(medicine) : ["09:00"];
      setTimes(t.length > 0 ? t : ["09:00"]);
      setStartDate(medicine?.start_date ?? todayISO());
      setEndDate(medicine?.end_date ?? "");
      setNotes(medicine?.notes ?? "");
      setRemApp(medicine?.reminder_app ?? true);
      setRemEmail(medicine?.reminder_email ?? false);
      setRemSms(medicine?.reminder_sms ?? false);
      setLead(String(medicine?.reminder_lead_minutes ?? 15));
    }
  }

  function changeFrequency(value: string) {
    setFrequency(value);
    const def = FREQUENCIES.find((f) => f.value === value);
    if (!def) return;
    if (def.slots > 0) {
      setTimes((prev) => {
        const next = [...prev];
        while (next.length < def.slots) next.push(def.defaults[next.length] ?? "09:00");
        return next.slice(0, def.slots);
      });
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    if (!name.trim()) return toast.error("Medicine name is required");
    const cleanTimes = times.filter(Boolean);
    if (cleanTimes.length === 0) return toast.error("Add at least one scheduled time");
    const slots = slotsFor(frequency);
    if (slots > 0 && cleanTimes.length !== slots) {
      return toast.error(`${frequency} needs ${slots} scheduled time${slots > 1 ? "s" : ""}`);
    }
    if (endDate && endDate < startDate) return toast.error("End date cannot be before the start date");

    const payload = {
      user_id: userId,
      medicine_name: name.trim(),
      strength: strength.trim() || null,
      dosage: strength.trim() || null,
      frequency,
      times: cleanTimes.map((t) => `${t}:00`),
      reminder_time: `${cleanTimes[0]}:00`,
      start_date: startDate,
      end_date: endDate || null,
      notes: notes.trim() || null,
      reminder_app: remApp,
      reminder_email: remEmail,
      reminder_sms: remSms,
      reminder_lead_minutes: Number(lead),
    };

    setSaving(true);
    const { error } = medicine
      ? await supabase.from("medicines").update(payload as never).eq("id", medicine.id)
      : await supabase.from("medicines").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(medicine ? "Medicine updated" : "Medicine added");
    onOpenChange(false);
    onSaved();
  }

  const custom = frequency === "Custom";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{medicine ? "Edit medicine" : "Add a new medicine"}</DialogTitle>
          <DialogDescription>Set the schedule and reminder preferences for this medicine.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Medicine name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dolo" required />
            </div>
            <div className="space-y-1.5">
              <Label>Strength</Label>
              <Input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="e.g. 650 mg" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={changeFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scheduled times</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) =>
                      setTimes((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                  />
                  {custom && times.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setTimes((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove time"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {custom && (
              <Button type="button" variant="outline" size="sm" onClick={() => setTimes((p) => [...p, "09:00"])}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Add time
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>End date (optional)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Take after food" rows={2} />
          </div>

          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><Bell className="h-4 w-4" /> Reminder preferences</p>
            <div className="flex items-center justify-between">
              <Label className="font-normal">App notification</Label>
              <Switch checked={remApp} onCheckedChange={setRemApp} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Gmail reminder</Label>
              <Switch checked={remEmail} onCheckedChange={setRemEmail} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-normal">SMS reminder</Label>
                <p className="text-xs text-muted-foreground">No SMS provider configured</p>
              </div>
              <Switch checked={remSms} onCheckedChange={setRemSms} disabled />
            </div>
            <div className="space-y-1.5">
              <Label className="font-normal">Remind me before</Label>
              <Select value={lead} onValueChange={setLead}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes before</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {medicine ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- details dialog ---------------- */

function MedicineDetailsDialog({
  medicine,
  doses,
  onOpenChange,
}: {
  medicine: Medicine | null;
  doses: Dose[];
  onOpenChange: (open: boolean) => void;
}) {
  const history = useMemo(
    () =>
      medicine
        ? doses
            .filter((d) => d.medicine_id === medicine.id)
            .sort((a, b) => `${b.scheduled_date}${b.scheduled_time}`.localeCompare(`${a.scheduled_date}${a.scheduled_time}`))
            .slice(0, 20)
        : [],
    [medicine, doses],
  );

  const adherence = useMemo(() => {
    if (!medicine) return null;
    const times = medTimes(medicine);
    if (times.length === 0) return null;
    let scheduled = 0;
    let taken = 0;
    for (let i = 6; i >= 0; i--) {
      const date = isoDaysAgo(i);
      if (!isActive(medicine, date)) continue;
      for (const t of times) {
        const logged = doses.find(
          (d) => d.medicine_id === medicine.id && d.scheduled_date === date && hhmm(d.scheduled_time) === t,
        );
        if (date === todayISO() && doseStatus(t, logged) === "upcoming") continue;
        scheduled += 1;
        if (logged?.status === "taken") taken += 1;
      }
    }
    return scheduled > 0 ? Math.round((taken / scheduled) * 100) : null;
  }, [medicine, doses]);

  if (!medicine) return null;
  const times = medTimes(medicine);
  const askQuestion = `Give me general educational information about ${medicine.medicine_name}${
    medicine.strength ? ` ${medicine.strength}` : ""
  } — what it is commonly used for and general safety information. Do not give me dosage advice.`;

  return (
    <Dialog open={!!medicine} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {medicine.medicine_name}
            {medicine.strength ? ` ${medicine.strength}` : ""}
          </DialogTitle>
          <DialogDescription>{medicine.frequency ?? "No frequency set"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complete schedule</p>
            <p>{times.length > 0 ? times.map(prettyTime).join(" · ") : "No times scheduled"}</p>
          </section>

          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Treatment period</p>
            <p>
              {medicine.start_date} → {medicine.end_date ?? "ongoing"} ·{" "}
              {isActive(medicine) ? "Active" : "Completed"}
            </p>
          </section>

          {medicine.notes && (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
              <p>{medicine.notes}</p>
            </section>
          )}

          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reminder settings</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant={medicine.reminder_app ? "default" : "outline"}>
                App {medicine.reminder_app ? "ON" : "OFF"}
              </Badge>
              <Badge variant={medicine.reminder_email ? "default" : "outline"}>
                Gmail {medicine.reminder_email ? "ON" : "OFF"}
              </Badge>
              <Badge variant="outline">SMS {medicine.reminder_sms ? "ON" : "OFF"}</Badge>
              <Badge variant="secondary">{medicine.reminder_lead_minutes} min before</Badge>
            </div>
          </section>

          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adherence (7 days)</p>
            <p className="font-display text-2xl font-bold">{adherence === null ? "—" : `${adherence}%`}</p>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dose history</p>
            {history.length === 0 ? (
              <p className="text-muted-foreground">No doses recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <span>
                      {d.scheduled_date} · {prettyTime(d.scheduled_time)}
                    </span>
                    <span className="flex items-center gap-2">
                      {d.taken_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.taken_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      {statusBadge(d.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> Ask Cure AI
            </p>
            <p className="text-xs text-muted-foreground">
              Educational information only. Cure AI cannot prescribe, change dosages, or tell you to start or stop a
              medicine — talk to your doctor for that.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/agent" search={{ q: askQuestion }}>
                Learn about {medicine.medicine_name}
              </Link>
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
