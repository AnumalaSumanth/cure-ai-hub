import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles, Download, Save, MessageCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  analyzeHealthRecord,
  RECORD_ANALYSIS_DISCLAIMER,
  type RecordAnalysisResult,
} from "@/lib/record-analysis.functions";

const STEPS = [
  "Reading document",
  "Extracting medical information",
  "Reviewing key values",
  "Preparing your summary",
];

function statusVariant(status: string) {
  switch (status) {
    case "Normal":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "High":
    case "Low":
    case "Abnormal":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function toPlainText(title: string, r: RecordAnalysisResult) {
  const lines = [
    `Cure AI — Health Record Analysis`,
    `Record: ${title}`,
    ``,
    `REPORT SUMMARY`,
    r.summary || "—",
    ``,
    `KEY FINDINGS`,
    ...(r.key_findings.length ? r.key_findings.map((f) => `- ${f}`) : ["—"]),
    ``,
    `IMPORTANT VALUES`,
    ...(r.values.length
      ? r.values.map((v) => `- ${v.test}: ${v.result} (ref: ${v.reference_range}) — ${v.status}`)
      : ["—"]),
    ``,
    `ABNORMAL / OUT-OF-RANGE RESULTS`,
    ...(r.abnormal.length
      ? r.abnormal.map((a) => `- ${a.test} (${a.direction}) — ${a.measures}. ${a.explanation}`)
      : ["None reported in this document."]),
    ``,
    `SIMPLE EXPLANATION`,
    r.simple_explanation || "—",
    ``,
    `QUESTIONS TO ASK A DOCTOR`,
    ...(r.doctor_questions.length ? r.doctor_questions.map((q) => `- ${q}`) : ["—"]),
    ``,
    r.urgent_note ? `IMPORTANT: ${r.urgent_note}` : "",
    ``,
    RECORD_ANALYSIS_DISCLAIMER,
  ];
  return lines.join("\n");
}

export function RecordAnalysisDialog({
  recordId,
  title,
  open,
  onOpenChange,
}: {
  recordId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const analyze = useServerFn(analyzeHealthRecord);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<RecordAnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2200);
    return () => clearInterval(id);
  }, [loading]);

  async function run() {
    setLoading(true);
    setStep(0);
    setResult(null);
    try {
      const res = await analyze({ data: { recordId } });
      setResult(res);
      if (!res.ok && res.message) toast.error(res.message);
    } catch {
      toast.error("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      void run();
    }
    if (!open) started.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function saveAnalysis() {
    if (!result?.ok) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("health_record_analyses").insert({
        user_id: uid,
        record_id: recordId,
        summary: result.summary,
        key_findings: result.key_findings,
        values: result.values,
        abnormal: result.abnormal,
        simple_explanation: result.simple_explanation,
        doctor_questions: result.doctor_questions,
        urgent_note: result.urgent_note,
      });
      if (error) throw error;
      toast.success("Analysis saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save analysis");
    } finally {
      setSaving(false);
    }
  }

  function exportSummary() {
    if (!result) return;
    const blob = new Blob([toPlainText(title, result)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9._-]/g, "_")}-analysis.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI analysis — {title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyzing your health record...
            </div>
            <ul className="mx-auto max-w-xs space-y-2">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  className={`flex items-center gap-2 text-sm ${i <= step ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {i < step ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : i === step ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                  )}
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : !result ? null : !result.ok ? (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 rounded-xl bg-muted p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p>{result.message}</p>
            </div>
            <Button onClick={() => void run()} variant="outline">
              <Sparkles className="mr-2 h-4 w-4" /> Analyze again
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {result.urgent_note && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{result.urgent_note}</p>
              </div>
            )}

            <Section title="Report summary">
              <p className="text-sm leading-relaxed text-muted-foreground">{result.summary || "Not available."}</p>
            </Section>

            {result.key_findings.length > 0 && (
              <Section title="Key findings">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.key_findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </Section>
            )}

            {result.values.length > 0 && (
              <Section title="Important values">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Test</th>
                        <th className="py-2 pr-3">Result</th>
                        <th className="py-2 pr-3">Reference range</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.values.map((v, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{v.test}</td>
                          <td className="py-2 pr-3">{v.result}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{v.reference_range}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusVariant(v.status)}`}>
                              {v.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {result.abnormal.length > 0 && (
              <Section title="Abnormal / out-of-range results">
                <div className="space-y-3">
                  {result.abnormal.map((a, i) => (
                    <div key={i} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{a.test}</p>
                        {a.direction && <Badge variant="outline">{a.direction}</Badge>}
                      </div>
                      {a.measures && <p className="mt-1 text-sm text-muted-foreground">{a.measures}</p>}
                      {a.explanation && <p className="mt-1 text-sm text-muted-foreground">{a.explanation}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {result.simple_explanation && (
              <Section title="Simple explanation">
                <p className="text-sm leading-relaxed text-muted-foreground">{result.simple_explanation}</p>
              </Section>
            )}

            {result.doctor_questions.length > 0 && (
              <Section title="Questions to ask a doctor">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.doctor_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{RECORD_ANALYSIS_DISCLAIMER}</p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void run()}>
                <Sparkles className="mr-2 h-4 w-4" /> Analyze again
              </Button>
              <Button variant="outline" onClick={() => void saveAnalysis()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save analysis
              </Button>
              <Button variant="outline" onClick={exportSummary}>
                <Download className="mr-2 h-4 w-4" /> Download summary
              </Button>
              <Button
                onClick={() =>
                  navigate({
                    to: "/agent",
                    search: { q: `About my health record "${title}": ${result.summary}`.slice(0, 500) },
                  })
                }
              >
                <MessageCircle className="mr-2 h-4 w-4" /> Ask Cure AI about this report
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-4">
        <h3 className="mb-2 font-display text-base font-semibold">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}
