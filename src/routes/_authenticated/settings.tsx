import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Cure AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailNotif, setEmailNotif] = useState(true);
  const [reminders, setReminders] = useState(true);

  async function handlePwChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return toast.error("Password must be at least 8 characters.");
    if (newPw !== confirm) return toast.error("Passwords don't match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setNewPw(""); setConfirm("");
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Settings</h1>
          <p className="mt-1 text-muted-foreground">Manage your account and preferences.</p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Personal information</CardTitle>
            <CardDescription>Your account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePwChange} className="space-y-4">
              <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Confirm new password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Notification preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row label="Email notifications" description="Important updates about your account.">
              <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
            </Row>
            <Separator />
            <Row label="Medicine reminders" description="Get reminders for your medications.">
              <Switch checked={reminders} onCheckedChange={setReminders} />
            </Row>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Privacy</CardTitle>
            <CardDescription>Your data is private and only visible to you.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">All health information is protected by row-level security and only accessible to your account.</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 shadow-soft">
          <CardHeader>
            <CardTitle className="font-display text-destructive">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Row({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
