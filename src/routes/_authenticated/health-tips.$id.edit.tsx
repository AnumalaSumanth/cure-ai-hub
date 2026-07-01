import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TipForm, type TipFormValues, type TipStatus } from "@/components/dashboard/TipForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health-tips/$id/edit")({
  head: () => ({ meta: [{ title: "Edit Health Tip — Cure AI" }] }),
  component: EditTipPage,
});

function EditTipPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tip, isLoading } = useQuery({
    queryKey: ["tip", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tips").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handleUpdate(values: TipFormValues) {
    const { error } = await supabase.from("tips").update(values).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tip updated");
    qc.invalidateQueries({ queryKey: ["tips"] });
    qc.invalidateQueries({ queryKey: ["tip", id] });
    navigate({ to: "/health-tips/$id", params: { id } });
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/health-tips/$id" params={{ id }}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to tip
          </Link>
        </Button>
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Edit Health Tip</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !tip ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Tip not found.</p>
            ) : (
              <TipForm
                submitLabel="Save changes"
                initial={{
                  title: tip.title,
                  category: tip.category ?? "",
                  content: tip.content,
                  target_audience: tip.target_audience ?? "",
                  tags: tip.tags ?? [],
                  status: tip.status as TipStatus,
                  notes: tip.notes ?? "",
                }}
                onSubmit={handleUpdate}
                onCancel={() => navigate({ to: "/health-tips/$id", params: { id } })}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
