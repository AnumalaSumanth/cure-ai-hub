import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Cure AI" }] }),
  component: ProfilePage,
});

type Profile = {
  full_name: string | null;
  age: number | null;
  gender: string | null;
  blood_group: string | null;
  height: number | null;
  weight: number | null;
  allergies: string | null;
  conditions: string | null;
  emergency_contact: string | null;
};

const empty: Profile = {
  full_name: "",
  age: null,
  gender: "",
  blood_group: "",
  height: null,
  weight: null,
  allergies: "",
  conditions: "",
  emergency_contact: "",
};

function ProfilePage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, age, gender, blood_group, height, weight, allergies, conditions, emergency_contact")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({ ...empty, ...data });
        setLoading(false);
      });
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, ...profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  }

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setProfile((p) => ({ ...p, [k]: v }));
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Your profile</h1>
          <p className="mt-1 text-muted-foreground">Keep your health information up to date.</p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="font-display">Health information</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full Name"><Input value={profile.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></Field>
                  <Field label="Emergency Contact"><Input value={profile.emergency_contact ?? ""} onChange={(e) => set("emergency_contact", e.target.value)} /></Field>
                  <Field label="Age"><Input type="number" min={0} value={profile.age ?? ""} onChange={(e) => set("age", e.target.value ? Number(e.target.value) : null)} /></Field>
                  <Field label="Gender"><Input value={profile.gender ?? ""} onChange={(e) => set("gender", e.target.value)} placeholder="e.g. Female" /></Field>
                  <Field label="Blood Group"><Input value={profile.blood_group ?? ""} onChange={(e) => set("blood_group", e.target.value)} placeholder="e.g. O+" /></Field>
                  <Field label="Height (cm)"><Input type="number" value={profile.height ?? ""} onChange={(e) => set("height", e.target.value ? Number(e.target.value) : null)} /></Field>
                  <Field label="Weight (kg)"><Input type="number" value={profile.weight ?? ""} onChange={(e) => set("weight", e.target.value ? Number(e.target.value) : null)} /></Field>
                </div>
                <Field label="Allergies"><Textarea rows={3} value={profile.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} /></Field>
                <Field label="Existing conditions"><Textarea rows={3} value={profile.conditions ?? ""} onChange={(e) => set("conditions", e.target.value)} /></Field>
                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save changes
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
