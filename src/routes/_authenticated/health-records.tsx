import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Loader2, ExternalLink, Download, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RecordAnalysisDialog } from "@/components/dashboard/RecordAnalysisDialog";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health-records")({
  head: () => ({ meta: [{ title: "Health Records — Cure AI" }] }),
  component: RecordsPage,
});

const BUCKET = "medical-library";
const STORAGE_PREFIX = "storage:";
const MAX_SIZE = 25 * 1024 * 1024;
const RECORD_TYPES = [
  "Blood Test",
  "Urine Test",
  "X-Ray",
  "MRI",
  "CT Scan",
  "Prescription",
  "Discharge Summary",
  "Other",
] as const;

function isStoragePath(value: string | null | undefined): value is string {
  return !!value && value.startsWith(STORAGE_PREFIX);
}
function storagePath(value: string) {
  return value.slice(STORAGE_PREFIX.length);
}

async function openStored(path: string, download = false) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 5, download ? { download: true } : undefined);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Could not open file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function RecordsPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordType, setRecordType] = useState<string>("Blood Test");
  const [analyzing, setAnalyzing] = useState<{ id: string; title: string } | null>(null);

  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("health_records").select("*").order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const url = String(fd.get("url") ?? "").trim();
    const recordDate = String(fd.get("record_date") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const file = fd.get("file") as File | null;

    if (!title) return toast.error("Title is required");
    if (file && file.size > MAX_SIZE) return toast.error("File must be under 25MB");

    setSaving(true);
    try {
      let fileUrl: string | null = url || null;
      let fileName: string | null = null;
      let fileType: string | null = null;
      if (file && file.size > 0) {
        fileName = file.name;
        fileType = file.type || null;
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/records/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) throw upErr;
        fileUrl = `${STORAGE_PREFIX}${path}`;
      }
      const { error } = await supabase.from("health_records").insert({
        user_id: user.id,
        title,
        file_url: fileUrl,
        record_type: recordType || null,
        record_date: recordDate || null,
        notes: notes || null,
        file_name: fileName,
        file_type: fileType,
      });
      if (error) throw error;
      toast.success("Record added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add record");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, fileUrl: string | null) {
    if (isStoragePath(fileUrl)) {
      await supabase.storage.from(BUCKET).remove([storagePath(fileUrl)]);
    }
    const { error } = await supabase.from("health_records").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Health Records</h1>
            <p className="mt-1 text-muted-foreground">Reports and documents you want to keep handy.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add record</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add health record</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5"><Label>Record name</Label><Input name="title" required placeholder="e.g. Blood test results" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Record type</Label>
                    <Select value={recordType} onValueChange={setRecordType}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {RECORD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input name="record_date" type="date" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Upload document (PDF, JPG, PNG — up to 25MB)</Label>
                  <Input name="file" type="file" accept="application/pdf,image/jpeg,image/png" />
                </div>
                <div className="space-y-1.5">
                  <Label>Or document URL (optional)</Label>
                  <Input name="url" type="url" placeholder="https://…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea name="notes" rows={3} placeholder="Anything you want to remember about this record" />
                </div>
                <DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !records || records.length === 0 ? (
          <EmptyState icon={FileText} title="No records yet" description="Add a record to keep important documents organized." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((r) => (
              <Card key={r.id} className="shadow-soft">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id, r.file_url)} aria-label="Delete"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                  <p className="mt-4 font-semibold">{r.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {r.record_type && <Badge variant="secondary">{r.record_type}</Badge>}
                    <p className="text-xs text-muted-foreground">
                      {r.record_date
                        ? new Date(r.record_date).toLocaleDateString()
                        : `Uploaded ${new Date(r.uploaded_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  {r.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>}
                  {r.file_url && (
                    <div className="mt-3 flex items-center gap-3">
                      {isStoragePath(r.file_url) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openStored(storagePath(r.file_url!))}
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openStored(storagePath(r.file_url!), true)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
                          >
                            Download <Download className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <a href={r.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                  {isStoragePath(r.file_url) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => setAnalyzing({ id: r.id, title: r.title })}
                    >
                      <Sparkles className="mr-2 h-4 w-4 text-primary" /> Analyze with AI
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {analyzing && (
        <RecordAnalysisDialog
          key={analyzing.id}
          recordId={analyzing.id}
          title={analyzing.title}
          open
          onOpenChange={(v) => !v && setAnalyzing(null)}
        />
      )}
    </DashboardLayout>
  );
}
