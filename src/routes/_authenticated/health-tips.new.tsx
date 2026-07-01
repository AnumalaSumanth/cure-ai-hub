import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TipForm, type TipFormValues } from "@/components/dashboard/TipForm";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/health-tips/new")({
  head: () => ({ meta: [{ title: "New Health Tip — Cure AI" }] }),
  component: NewTipPage,
});

function NewTipPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useUser();

  async function handleCreate(values: TipFormValues) {
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    const { error } = await supabase.from("tips").insert({
      user_id: user.id,
      ...values,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Health tip created");
    qc.invalidateQueries({ queryKey: ["tips"] });
    navigate({ to: "/health-tips" });
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/health-tips"><ArrowLeft className="mr-2 h-4 w-4" /> Back to tips</Link>
        </Button>
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Create Health Tip</CardTitle>
          </CardHeader>
          <CardContent>
            <TipForm
              submitLabel="Create tip"
              onSubmit={handleCreate}
              onCancel={() => navigate({ to: "/health-tips" })}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
