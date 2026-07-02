import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TipForm, type TipFormValues } from "@/components/dashboard/TipForm";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { createTip } from "@/lib/tips-actions";

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
    try {
      await createTip(user.id, values);
      toast.success("Health tip created");
      qc.invalidateQueries({ queryKey: ["tips"] });
      navigate({ to: "/health-tips" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create tip");
    }
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
