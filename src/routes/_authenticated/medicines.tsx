import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill, Plus, Trash2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/medicines")({
  head: () => ({ meta: [{ title: "Medicines — Cure AI" }] }),
  component: MedicinesPage,
});

function MedicinesPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: meds, isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medicines").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const { error } = await supabase.from("medicines").insert({
      user_id: user.id,
      medicine_name: String(fd.get("name")),
      dosage: String(fd.get("dosage") ?? ""),
      frequency: String(fd.get("frequency") ?? ""),
      reminder_time: (fd.get("reminder_time") as string) || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Medicine added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["medicines"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("medicines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["medicines"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Medicines</h1>
            <p className="mt-1 text-muted-foreground">All your prescriptions, in one place.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add medicine</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a new medicine</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5"><Label>Medicine name</Label><Input name="name" required /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Dosage</Label><Input name="dosage" placeholder="e.g. 500 mg" /></div>
                  <div className="space-y-1.5"><Label>Frequency</Label><Input name="frequency" placeholder="e.g. Twice daily" /></div>
                </div>
                <div className="space-y-1.5"><Label>Reminder time</Label><Input name="reminder_time" type="time" /></div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !meds || meds.length === 0 ? (
          <EmptyState icon={Pill} title="No medicines yet" description="Add your first medicine to keep track of dosages and reminders." />
        ) : (
          <Card className="shadow-soft">
            <CardHeader><CardTitle className="font-display">Your medicines</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {meds.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Pill className="h-5 w-5" /></div>
                      <div>
                        <p className="font-medium">{m.medicine_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[m.dosage, m.frequency, m.reminder_time].filter(Boolean).join(" · ") || "No details"}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
