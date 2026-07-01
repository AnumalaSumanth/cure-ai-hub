import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2, Loader2 } from "lucide-react";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health-tips/$id")({
  head: () => ({ meta: [{ title: "Health Tip — Cure AI" }] }),
  component: TipDetailPage,
});

function TipDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
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
          <Card className="shadow-soft">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-2xl">{tip.title}</CardTitle>
                  {tip.category && <p className="mt-1 text-sm text-muted-foreground">{tip.category}</p>}
                </div>
                <Badge variant={tip.status === "Published" ? "default" : tip.status === "Archived" ? "outline" : "secondary"}>
                  {tip.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/health-tips/$id/edit" params={{ id }}><Pencil className="mr-2 h-4 w-4" /> Edit</Link>
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
                <div>
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
