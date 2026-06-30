import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
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

function RecordsPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const { error } = await supabase.from("health_records").insert({
      user_id: user.id,
      title: String(fd.get("title")),
      file_url: String(fd.get("url") ?? ""),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Record added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("health_records").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
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
                <div className="space-y-1.5"><Label>Title</Label><Input name="title" required placeholder="e.g. Blood test results" /></div>
                <div className="space-y-1.5"><Label>Document URL (optional)</Label><Input name="url" type="url" placeholder="https://…" /></div>
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
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                  <p className="mt-4 font-semibold">{r.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Uploaded {new Date(r.uploaded_at).toLocaleDateString()}</p>
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
