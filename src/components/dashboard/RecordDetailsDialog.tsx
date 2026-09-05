import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, ExternalLink, Sparkles, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RECORD_ANALYSIS_DISCLAIMER, type RecordAnalysisResult } from "@/lib/record-analysis.functions";
import { formatDay } from "@/lib/record-utils";

const BUCKET = "medical-library";

export type HealthRecordRow = {
  id: string;
  title: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  record_type: string | null;
  record_date: string | null;
  notes: string | null;
  uploaded_at: string;
};

export type AnalysisRow = {
  id: string;
  record_id: string;
  created_at: string;
  summary: string | null;
  key_findings: unknown;
  values: unknown;
  abnormal: unknown;
  simple_explanation: string | null;
  doctor_questions: unknown;
  urgent_note: string | null;
};

export function analysisToResult(row: AnalysisRow): RecordAnalysisResult {
  return {
    ok: true,
    summary: row.summary ?? "",
    key_findings: (row.key_findings as string[]) ?? [],
    values: (row.values as RecordAnalysisResult["values"]) ?? [],
    abnormal: (row.abnormal as RecordAnalysisResult["abnormal"]) ?? [],
    simple_explanation: row.simple_explanation ?? "",
    doctor_questions: (row.doctor_questions as string[]) ?? [],
    urgent_note: row.urgent_note ?? "",
    disclaimer: RECORD_ANALYSIS_DISCLAIMER,
  };
}

export function RecordDetailsDialog({
  record,
  analyses,
  open,
  onOpenChange,
  onAnalyze,
  onViewAnalysis,
  onDelete,
}: {
  record: HealthRecordRow;
  analyses: AnalysisRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAnalyze: () => void;
  onViewAnalysis: (row: AnalysisRow) => void;
  onDelete: () => void;
}) {
  const isStored = !!record.file_url?.startsWith("storage:");
  const path = isStored ? record.file_url!.slice("storage:".length) : null;
  const [downloading, setDownloading] = useState(false);

  const { data: signedUrl, isLoading: urlLoading, error } = useQuery({
    queryKey: ["record-preview", record.id],
    enabled: open && !!path,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 60 * 10);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  useEffect(() => {
    if (error) toast.error("Could not open this document.");
  }, [error]);

  const isImage = (record.file_type ?? "").startsWith("image/");
  const isPdf = (record.file_type ?? "").includes("pdf");

  async function download() {
    if (!path) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, { download: true });
      if (error || !data?.signedUrl) throw error ?? new Error("Failed");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border bg-muted/30 p-2">
            {!isStored ? (
              record.file_url ? (
                <a
                  href={record.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-64 items-center justify-center gap-2 text-sm font-medium text-primary"
                >
                  Open linked document <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">No document attached</div>
              )
            ) : urlLoading ? (
              <div className="grid h-64 place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !signedUrl ? (
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            ) : isImage ? (
              <img src={signedUrl} alt={record.title} className="max-h-[420px] w-full rounded-lg object-contain" />
            ) : isPdf ? (
              <iframe src={signedUrl} title={record.title} className="h-[420px] w-full rounded-lg" />
            ) : (
              <div className="grid h-64 place-items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-6 w-6" />
                Preview not supported for this file type
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="shadow-soft">
              <CardContent className="space-y-2 p-4 text-sm">
                <h3 className="font-display text-base font-semibold">Record information</h3>
                <Info label="Type" value={record.record_type ?? "—"} />
                <Info label="Record date" value={formatDay(record.record_date)} />
                <Info label="Uploaded" value={formatDay(record.uploaded_at)} />
                <Info label="File" value={record.file_name ?? "—"} />
                {record.notes && <Info label="Notes" value={record.notes} />}
                <div className="pt-1">
                  <Badge variant={analyses.length ? "secondary" : "outline"}>
                    {analyses.length ? "Analysis available" : "Not analyzed"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardContent className="space-y-3 p-4">
                <h3 className="font-display text-base font-semibold">AI analysis history</h3>
                {analyses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved analyses yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {analyses.map((a, i) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                        <div>
                          <p className="font-medium">Version {analyses.length - i}</p>
                          <p className="text-xs text-muted-foreground">{formatDay(a.created_at)}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => onViewAnalysis(a)}>
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              {isStored && (
                <Button size="sm" onClick={onAnalyze}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {analyses.length ? "Analyze again" : "Analyze with AI"}
                </Button>
              )}
              {isStored && (
                <Button size="sm" variant="outline" onClick={() => void download()} disabled={downloading}>
                  {downloading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </div>

            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{RECORD_ANALYSIS_DISCLAIMER}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}
