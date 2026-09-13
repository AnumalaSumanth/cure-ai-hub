import { useEffect, useState } from "react";
import { Loader2, Stethoscope } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { prepareDoctorVisit } from "@/lib/visit-prep.functions";
import type { VisitPrep } from "@/lib/visit-prep.server";
import { toast } from "sonner";

function Section({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="font-display text-sm font-semibold">{title}</h4>
      {numbered ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}
    </div>
  );
}

export function VisitPrepDialog({
  appointmentId,
  open,
  onOpenChange,
}: {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [prep, setPrep] = useState<VisitPrep | null>(null);

  useEffect(() => {
    if (!open || !appointmentId) return;
    let active = true;
    setPrep(null);
    setLoading(true);
    prepareDoctorVisit({ data: { appointmentId } })
      .then((res) => { if (active) setPrep(res); })
      .catch((err: Error) => { if (active) toast.error(err.message || "Could not prepare the summary."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, appointmentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Stethoscope className="h-5 w-5 text-primary" /> Doctor Visit Preparation
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="mt-2 text-sm">Organising your saved health information…</p>
          </div>
        )}

        {!loading && prep && (
          <div className="space-y-3">
            <div className="rounded-xl bg-primary/5 p-4">
              <p className="font-display font-semibold">Dr. {prep.appointment.doctor_name}</p>
              <p className="text-sm text-muted-foreground">
                {prep.appointment.hospital_name ? `${prep.appointment.hospital_name} · ` : ""}
                {prep.appointment.appointment_date}
                {prep.appointment.appointment_time ? ` at ${prep.appointment.appointment_time}` : ""}
              </p>
            </div>
            <Section title="Main Concerns" items={prep.main_concerns} />
            <Section title="Recent Information" items={prep.recent_information} />
            <Section title="Current Medicines" items={prep.current_medicines} />
            <Section title="Recent Health Records" items={prep.recent_records} />
            <Section title="Important Findings" items={prep.important_findings} />
            <Section title="Questions to Ask" items={prep.questions_to_ask} numbered />
            <Section title="Things to Mention" items={prep.things_to_mention} />
            <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              {prep.disclaimer}
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
