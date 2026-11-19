import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Loader2, ExternalLink, Download, Sparkles, Eye, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordAnalysisDialog } from "@/components/dashboard/RecordAnalysisDialog";
import {
  RecordDetailsDialog,
  analysisToResult,
  type AnalysisRow,
  type HealthRecordRow,
} from "@/components/dashboard/RecordDetailsDialog";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { RECORD_TYPES, recordIcon, formatDay } from "@/lib/record-utils";
import type { RecordAnalysisResult } from "@/lib/record-analysis.functions";

export const Route = createFileRoute("/_authenticated/health-records")({
  validateSearch: (search: Record<string, unknown>) => ({
    recordId: typeof search.recordId === "string" ? search.recordId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Health Records — Cure AI" },
      {
        name: "description",
        content: "Keep your medical reports, prescriptions and scans organized and analyze them with Cure AI.",
      },
      { property: "og:title", content: "Health Records — Cure AI" },
      {
        property: "og:description",
        content: "A private, organized home for your medical reports with optional AI analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecordsPage,
});

const BUCKET = "medical-library";
const STORAGE_PREFIX = "storage:";
const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

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
  const navigate = useNavigate();
  const { recordId: linkedRecordId } = Route.useSearch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordType, setRecordType] = useState<string>("Blood Test");
  const [analyzing, setAnalyzing] = useState<{ id: string; title: string; initial?: RecordAnalysisResult } | null>(
    null,
  );
  const [details, setDetails] = useState<HealthRecordRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HealthRecordRow | null>(null);
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState<{ existing: HealthRecordRow; submit: () => void } | null>(null);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [analysisFilter, setAnalysisFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_records")
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as HealthRecordRow[];
    },
  });

  useEffect(() => {
    if (!linkedRecordId || !records) return;
    const record = records.find((item) => item.id === linkedRecordId);
    if (record) setDetails(record);
    void navigate({ to: "/health-records", search: { recordId: undefined }, replace: true });
  }, [linkedRecordId, navigate, records]);

  const { data: analyses } = useQuery({
    queryKey: ["record-analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_record_analyses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnalysisRow[];
    },
  });

  const byRecord = useMemo(() => {
    const map = new Map<string, AnalysisRow[]>();
    (analyses ?? []).forEach((a) => {
      map.set(a.record_id, [...(map.get(a.record_id) ?? []), a]);
    });
    return map;
  }, [analyses]);

  const stats = useMemo(() => {
    const all = records ?? [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      total: all.length,
      analyzed: all.filter((r) => byRecord.has(r.id)).length,
      recent: all.filter((r) => new Date(r.uploaded_at).getTime() >= weekAgo).length,
      types: new Set(all.map((r) => r.record_type).filter(Boolean)).size,
    };
  }, [records, byRecord]);

  const visible = useMemo(() => {
    let list = [...(records ?? [])];
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          (r.file_name ?? "").toLowerCase().includes(needle) ||
          (r.notes ?? "").toLowerCase().includes(needle),
      );
    }
    if (typeFilter !== "all") list = list.filter((r) => r.record_type === typeFilter);
    if (analysisFilter === "analyzed") list = list.filter((r) => byRecord.has(r.id));
    if (analysisFilter === "not") list = list.filter((r) => !byRecord.has(r.id));
    list.sort((a, b) => {
      const av = new Date(a.record_date ?? a.uploaded_at).getTime();
      const bv = new Date(b.record_date ?? b.uploaded_at).getTime();
      return sort === "newest" ? bv - av : av - bv;
    });
    return list;
  }, [records, q, typeFilter, analysisFilter, sort, byRecord]);

  const timeline = useMemo(
    () =>
      [...(records ?? [])]
        .sort(
          (a, b) =>
            new Date(b.record_date ?? b.uploaded_at).getTime() - new Date(a.record_date ?? a.uploaded_at).getTime(),
        )
        .slice(0, 8),
    [records],
  );

  const trends = useMemo(() => {
    const map = new Map<string, { date: string; result: string; range: string }[]>();
    (analyses ?? []).forEach((a) => {
      const rec = (records ?? []).find((r) => r.id === a.record_id);
      const when = rec?.record_date ?? a.created_at;
      const values = (a.values as RecordAnalysisResult["values"]) ?? [];
      values.forEach((v) => {
        if (!v.test || !v.result || v.result === "Not Available") return;
        const key = v.test.trim();
        map.set(key, [...(map.get(key) ?? []), { date: when, result: v.result, range: v.reference_range }]);
      });
    });
    return [...map.entries()]
      .filter(([, rows]) => rows.length >= 2)
      .map(([test, rows]) => ({
        test,
        rows: rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }))
      .slice(0, 5);
  }, [analyses, records]);

  const { data: profile } = useQuery({
    queryKey: ["profile-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("blood_group, allergies, conditions")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function insertRecord(payload: {
    title: string;
    fileUrl: string | null;
    recordDate: string;
    notes: string;
    fileName: string | null;
    fileType: string | null;
  }) {
    if (!user) return;
    const { error } = await supabase.from("health_records").insert({
      user_id: user.id,
      title: payload.title,
      file_url: payload.fileUrl,
      record_type: recordType || null,
      record_date: payload.recordDate || null,
      notes: payload.notes || null,
      file_name: payload.fileName,
      file_type: payload.fileType,
    });
    if (error) throw error;
    toast.success("Health record uploaded successfully.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const url = String(fd.get("url") ?? "").trim();
    const recordDate = String(fd.get("record_date") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const file = fd.get("file") as File | null;

    if (!title) return toast.error("Record title is required");
    if (file && file.size > 0) {
      if (file.size > MAX_SIZE) return toast.error("File must be under 25MB");
      if (!ALLOWED.includes((file.type || "").toLowerCase()))
        return toast.error("Please upload a PDF, JPG or PNG file");
    }

    const run = async () => {
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
        await insertRecord({ title, fileUrl, recordDate, notes, fileName, fileType });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
      } finally {
        setSaving(false);
      }
    };

    const existing = (records ?? []).find(
      (r) =>
        r.title.trim().toLowerCase() === title.toLowerCase() &&
        (r.record_date ?? "") === recordDate &&
        (r.record_type ?? "") === recordType,
    );
    if (existing) {
      setDuplicate({ existing, submit: () => void run() });
      return;
    }
    void run();
  }

  async function confirmDelete() {
    const rec = pendingDelete;
    if (!rec) return;
    setPendingDelete(null);
    if (isStoragePath(rec.file_url)) {
      await supabase.storage.from(BUCKET).remove([storagePath(rec.file_url)]);
    }
    const { error } = await supabase.from("health_records").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("Record deleted");
    setDetails(null);
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["record-analyses"] });
    qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
  }

  function startAnalysis(r: HealthRecordRow) {
    setRunningIds((ids) => [...ids, r.id]);
    setAnalyzing({ id: r.id, title: r.title });
  }

  function statusBadge(r: HealthRecordRow) {
    if (runningIds.includes(r.id) && analyzing?.id === r.id)
      return <Badge variant="outline">Analyzing…</Badge>;
    if (byRecord.has(r.id)) return <Badge variant="secondary">Analysis available</Badge>;
    return <Badge variant="outline">Not analyzed</Badge>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Health Records</h1>
            <p className="mt-1 text-muted-foreground">Keep your medical reports and health documents organized.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add record
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add health record</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Record title</Label>
                  <Input name="title" required placeholder="e.g. Blood test results" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Record type</Label>
                    <Select value={recordType} onValueChange={setRecordType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECORD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Record date</Label>
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
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Uploading…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total records" value={stats.total} loading={isLoading} />
          <Stat label="Analyzed records" value={stats.analyzed} loading={isLoading} />
          <Stat label="Recent uploads (7d)" value={stats.recent} loading={isLoading} />
          <Stat label="Record types" value={stats.types} loading={isLoading} />
        </div>

        {(records?.length ?? 0) > 0 && (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search records"
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select value={analysisFilter} onValueChange={setAnalysisFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any analysis</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="not">Not analyzed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : !records || records.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No health records yet"
            description="Upload your medical reports, prescriptions, and health documents to keep them organized in one place."
          />
        ) : visible.length === 0 ? (
          <Card className="shadow-soft">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No records match your search or filters.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((r) => {
              const Icon = recordIcon(r.record_type);
              const saved = byRecord.get(r.id);
              return (
                <Card key={r.id} className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(r)}
                        aria-label="Delete record"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="mt-4 font-semibold">{r.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {r.record_type && <Badge variant="secondary">{r.record_type}</Badge>}
                      {statusBadge(r)}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Record date: {formatDay(r.record_date)} · Uploaded {formatDay(r.uploaded_at)}
                    </p>
                    {r.file_name && <p className="truncate text-xs text-muted-foreground">{r.file_name}</p>}
                    {r.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.notes}</p>}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDetails(r)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Open <Eye className="h-3 w-3" />
                      </button>
                      {isStoragePath(r.file_url) ? (
                        <button
                          type="button"
                          onClick={() => openStored(storagePath(r.file_url!), true)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
                        >
                          Download <Download className="h-3 w-3" />
                        </button>
                      ) : r.file_url ? (
                        <a
                          href={r.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
                        >
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>

                    {isStoragePath(r.file_url) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 w-full"
                        onClick={() =>
                          saved?.length
                            ? setAnalyzing({ id: r.id, title: r.title, initial: analysisToResult(saved[0]!) })
                            : startAnalysis(r)
                        }
                      >
                        <Sparkles className="mr-2 h-4 w-4 text-primary" />
                        {saved?.length ? "View AI analysis" : "Analyze with AI"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {timeline.length > 0 && (
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Health timeline</h2>
              <ul className="mt-4 space-y-4">
                {timeline.map((r) => {
                  const Icon = recordIcon(r.record_type);
                  return (
                    <li key={r.id} className="flex gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{formatDay(r.record_date ?? r.uploaded_at)}</p>
                        <p className="text-sm">{r.record_type ?? "Record"} — {r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {byRecord.has(r.id) ? "AI analysis available" : "Not analyzed"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {trends.length > 0 && (
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Lab result trends</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Values taken from your saved AI analyses, shown only where two or more results exist.
              </p>
              <div className="mt-4 space-y-5">
                {trends.map((t) => (
                  <div key={t.test}>
                    <p className="font-medium">{t.test}</p>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {t.rows.map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1.5 pr-4 text-muted-foreground">{formatDay(row.date)}</td>
                              <td className="py-1.5 pr-4 font-medium">{row.result}</td>
                              <td className="py-1.5 text-muted-foreground">{row.range}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {profile && (profile.blood_group || profile.allergies || profile.conditions) && (
          <Card className="shadow-soft">
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-semibold">Health summary</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                From details you confirmed in your profile — never filled in automatically by AI.
              </p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                {profile.blood_group && (
                  <p>
                    <span className="text-muted-foreground">Blood group: </span>
                    {profile.blood_group}
                  </p>
                )}
                {profile.allergies && (
                  <p>
                    <span className="text-muted-foreground">Allergies: </span>
                    {profile.allergies}
                  </p>
                )}
                {profile.conditions && (
                  <p>
                    <span className="text-muted-foreground">Conditions: </span>
                    {profile.conditions}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {details && (
        <RecordDetailsDialog
          key={details.id}
          record={details}
          analyses={byRecord.get(details.id) ?? []}
          open
          onOpenChange={(v) => !v && setDetails(null)}
          onAnalyze={() => {
            setDetails(null);
            startAnalysis(details);
          }}
          onViewAnalysis={(row) => {
            setDetails(null);
            setAnalyzing({ id: details.id, title: details.title, initial: analysisToResult(row) });
          }}
          onDelete={() => setPendingDelete(details)}
        />
      )}

      {analyzing && (
        <RecordAnalysisDialog
          key={`${analyzing.id}-${analyzing.initial ? "saved" : "new"}`}
          recordId={analyzing.id}
          title={analyzing.title}
          initial={analyzing.initial ?? null}
          open
          onSaved={() => qc.invalidateQueries({ queryKey: ["record-analyses"] })}
          onOpenChange={(v) => {
            if (!v) {
              setRunningIds((ids) => ids.filter((id) => id !== analyzing.id));
              setAnalyzing(null);
            }
          }}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and its uploaded document will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicate} onOpenChange={(v) => !v && setDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This record may already exist.</AlertDialogTitle>
            <AlertDialogDescription>
              You already have “{duplicate?.existing.title}” with the same type and date. Nothing will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const existing = duplicate?.existing;
                setDuplicate(null);
                setOpen(false);
                if (existing) setDetails(existing);
              }}
            >
              View existing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const submit = duplicate?.submit;
                setDuplicate(null);
                submit?.();
              }}
            >
              Upload anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-bold">{value}</p>}
      </CardContent>
    </Card>
  );
}
