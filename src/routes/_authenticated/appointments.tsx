import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, Trash2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({ meta: [{ title: "Appointments — Cure AI" }] }),
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: appts, isLoading } = useQuery({
    queryKey: ["appointments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments").select("*").order("appointment_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const doctor = String(fd.get("doctor") ?? "").trim();
    const hospital = String(fd.get("hospital") ?? "").trim();
    const date = String(fd.get("date") ?? "");
    const time = String(fd.get("time") ?? "");
    if (!doctor || !hospital || !date || !time) {
      return toast.error("Doctor, hospital, date and time are required.");
    }
    if (new Date(`${date}T${time}`).getTime() < Date.now()) {
      return toast.error("Appointment date and time cannot be in the past.");
    }
    const method = String(fd.get("reminder_method") ?? "email");
    setSaving(true);
    const { error } = await supabase.from("appointments").insert({
      user_id: user.id,
      doctor_name: doctor,
      hospital_name: hospital,
      appointment_date: date,
      appointment_time: time,
      notes: String(fd.get("notes") ?? ""),
      status: "upcoming",
      reminder_method: method,
      reminder_offset: String(fd.get("reminder_offset") ?? "1_day"),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Appointment added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["appointments-all"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
    qc.invalidateQueries({ queryKey: ["upcoming-appointments"] });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["appointments-all"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
    qc.invalidateQueries({ queryKey: ["upcoming-appointments"] });
  }

  function displayStatus(a: { status: string; appointment_date: string; appointment_time: string | null }) {
    if (a.status === "cancelled") return "cancelled";
    const at = new Date(`${a.appointment_date}T${a.appointment_time ?? "23:59"}`).getTime();
    return at < Date.now() ? "completed" : "upcoming";
  }


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Appointments</h1>
            <p className="mt-1 text-muted-foreground">Stay on top of every doctor visit.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add appointment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New appointment</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5"><Label>Doctor name</Label><Input name="doctor" required /></div>
                <div className="space-y-1.5"><Label>Hospital / Clinic</Label><Input name="hospital" required /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Date</Label><Input name="date" type="date" required /></div>
                  <div className="space-y-1.5"><Label>Time</Label><Input name="time" type="time" required /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reminder_method">Reminder method</Label>
                    <select
                      id="reminder_method"
                      name="reminder_method"
                      defaultValue="email"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="email">Email (to your account address)</option>
                      <option value="sms" disabled>SMS — not configured</option>
                      <option value="none">No reminder</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reminder_offset">Remind me</Label>
                    <select
                      id="reminder_offset"
                      name="reminder_offset"
                      defaultValue="1_day"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="1_day">1 day before</option>
                      <option value="1_hour">1 hour before</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={3} /></div>

                <DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !appts || appts.length === 0 ? (
          <EmptyState icon={Calendar} title="No appointments yet" description="Add your first appointment to track upcoming visits." />
        ) : (
          <Card className="shadow-soft">
            <CardHeader><CardTitle className="font-display">All appointments</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.doctor_name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.hospital_name ?? "—"}</TableCell>
                      <TableCell>{a.appointment_date}</TableCell>
                      <TableCell>{a.appointment_time ?? "—"}</TableCell>
                      <TableCell><Badge variant={a.status === "upcoming" ? "default" : "secondary"}>{a.status}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
