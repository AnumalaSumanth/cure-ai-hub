import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Upload,
  Trash2,
  Loader2,
  Download,
  Eye,
  FileText,
  FileImage,
  FileArchive,
  File as FileIcon,
  GraduationCap,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/medical-library")({
  head: () => ({ meta: [{ title: "Medical Library — Cure AI" }] }),
  component: MedicalLibraryPage,
});

const BUCKET = "medical-library";
const CATEGORIES = ["Notes", "Study Material", "Research Paper", "Image", "Report", "Other"] as const;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

type Doc = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  created_at: string;
};

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(type: string | null) {
  if (!type) return FileIcon;
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf") return FileText;
  if (type.includes("word") || type.includes("document") || type.startsWith("text/")) return FileText;
  if (type.includes("zip") || type.includes("compressed")) return FileArchive;
  return FileIcon;
}

function canPreview(type: string | null): boolean {
  if (!type) return false;
  return type.startsWith("image/") || type === "application/pdf" || type.startsWith("text/");
}

function MedicalLibraryPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("Notes");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [preview, setPreview] = useState<{ url: string; doc: Doc } | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["medical-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medical_documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
    enabled: !!user,
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > MAX_BYTES) {
      toast.error("File exceeds 25MB limit.");
      return;
    }

    setUploading(true);
    setProgress(15);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;

    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      setProgress(70);

      const { error: insErr } = await supabase.from("medical_documents").insert({
        user_id: user.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
        category,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      setProgress(100);
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["medical-documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 400);
    }
  }

  async function handleDownload(doc: Doc) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 60, { download: doc.file_name });
    if (error || !data) return toast.error(error?.message ?? "Could not download");
    window.open(data.signedUrl, "_blank");
  }

  async function handlePreview(doc: Doc) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 300);
    if (error || !data) return toast.error(error?.message ?? "Could not preview");
    setPreview({ url: data.signedUrl, doc });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const doc = toDelete;
    setToDelete(null);
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([doc.file_path]);
    if (sErr) return toast.error(sErr.message);
    const { error: dErr } = await supabase.from("medical_documents").delete().eq("id", doc.id);
    if (dErr) return toast.error(dErr.message);
    toast.success("Document deleted");
    qc.invalidateQueries({ queryKey: ["medical-documents"] });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Medical Library</h1>
            <p className="mt-1 text-muted-foreground">
              Securely store your medical notes, study materials, research papers, and reference documents.
            </p>
          </div>
        </div>

        <Card className="shadow-soft">
          <CardContent className="p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.rtf,.png,.jpg,.jpeg,.gif,.webp,.svg,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !user}
                className="sm:col-start-3"
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload document"}
              </Button>
            </div>
            {uploading && (
              <div className="mt-4">
                <Progress value={progress} />
                <p className="mt-1 text-xs text-muted-foreground">Uploading securely to your private library…</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Max 25MB per file. Supported: PDF, DOC/DOCX, TXT, images.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !docs || docs.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No documents yet"
            description="Upload your first medical document to start building your private library."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => {
              const Icon = iconFor(d.file_type);
              return (
                <Card key={d.id} className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {d.category && <Badge variant="secondary">{d.category}</Badge>}
                    </div>
                    <p className="mt-4 truncate font-semibold" title={d.file_name}>{d.file_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(d.file_size)} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {canPreview(d.file_type) && (
                        <Button size="sm" variant="outline" onClick={() => handlePreview(d)}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleDownload(d)}>
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          to="/study-ai"
                          search={{ subject: d.category ?? "Medical Library", topic: d.file_name.replace(/\.[^.]+$/, "") }}
                        >
                          <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Study plan
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setToDelete(d)}
                        aria-label="Delete"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{toDelete?.file_name}” from your library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.doc.file_name}</DialogTitle>
          </DialogHeader>
          {preview && (
            preview.doc.file_type?.startsWith("image/") ? (
              <img src={preview.url} alt={preview.doc.file_name} className="mx-auto max-h-[70vh] rounded-md" />
            ) : (
              <iframe
                src={preview.url}
                title={preview.doc.file_name}
                className="h-[70vh] w-full rounded-md border"
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
