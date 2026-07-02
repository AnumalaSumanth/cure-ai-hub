import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2, Loader2, Clock, Star, Copy, Printer } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { readingTimeMinutes } from "@/lib/health-tips-utils";

export const Route = createFileRoute("/_authenticated/health-tips/$id")({
  head: () => ({ meta: [{ title: "Health Tip — Cure AI" }] }),
  component: TipDetailPage,
});

function TipDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useUser();

  const { data: tip, isLoading, error } = useQuery({
    queryKey: ["tip", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tips").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handleDelete() {
    const { error } = await supabase.from("tips").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tip deleted");
    qc.invalidateQueries({ queryKey: ["tips"] });
    navigate({ to: "/health-tips" });
  }

  async function handleCopy() {
    if (!tip) return;
    try {
      await navigator.clipboard.writeText(`${tip.title}\n\n${tip.content}`);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function handleDuplicate() {
    if (!tip || !user) return;
    const { data, error } = await supabase
      .from("tips")
      .insert({
        user_id: user.id,
        title: `${tip.title} (Copy)`,
        category: tip.category,
        content: tip.content,
        target_audience: tip.target_audience,
        tags: tip.tags ?? [],
        status: "Draft",
        notes: tip.notes,
        ai_summary: tip.ai_summary,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Tip duplicated");
    qc.invalidateQueries({ queryKey: ["tips"] });
    navigate({ to: "/health-tips/$id/edit", params: { id: data.id } });
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit print:hidden">
          <Link to="/health-tips"><ArrowLeft className="mr-2 h-4 w-4" /> Back to tips</Link>
        </Button>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error || !tip ? (
          <Card className="shadow-soft">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Tip not found.
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-soft print:shadow-none print:border-none">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="font-display text-2xl">{tip.title}</CardTitle>
                    {tip.is_featured && (
                      <Badge className="gap-1 bg-warning/15 text-warning hover:bg-warning/15">
                        <Star className="h-3 w-3 fill-warning" /> Featured
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {tip.category && <span>{tip.category}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {readingTimeMinutes(tip.content)} min read
                    </span>
                  </div>
                </div>
                <Badge variant={tip.status === "Published" ? "default" : tip.status === "Archived" ? "outline" : "secondary"}>
                  {tip.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button asChild size="sm">
                  <Link to="/health-tips/$id/edit" params={{ id }}><Pencil className="mr-2 h-4 w-4" /> Edit</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={handleDuplicate}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" /> Copy text
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this tip?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{tip.title}" will be permanently removed. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {tip.ai_summary && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">AI summary</p>
                  <p className="mt-1 text-sm leading-relaxed">{tip.ai_summary}</p>
                </div>
              )}
              {tip.target_audience && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target audience</p>
                  <p className="mt-1 text-sm">{tip.target_audience}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{tip.content}</p>
              </div>
              {tip.tags && tip.tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tip.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {tip.notes && (
                <div className="print:hidden">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{tip.notes}</p>
                </div>
              )}
              <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                Created {new Date(tip.created_at).toLocaleString()} · Updated {new Date(tip.updated_at).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
