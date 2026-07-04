import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  GraduationCap,
  Sparkles,
  Loader2,
  Copy,
  Save,
  Trash2,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import {
  generateStudyPlan,
  type StudyPlanDay,
  type StudyPlanResult,
} from "@/lib/study-plan.functions";

const SearchSchema = z.object({
  subject: z.string().optional(),
  topic: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/study-ai")({
  head: () => ({
    meta: [
      { title: "Curo Study AI — Personalized Study Plans" },
      {
        name: "description",
        content:
          "Generate personalized, day-by-day study plans for medical and healthcare topics with Curo Study AI.",
      },
    ],
  }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: StudyAIPage,
});

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

type SavedPlan = {
  id: string;
  subject: string;
  topic: string;
  difficulty: string;
  daily_hours: number;
  days: number;
  exam_date: string | null;
  plan: StudyPlanDay[];
  tip: string | null;
  source_document_id: string | null;
  created_at: string;
};

const DISCLAIMER =
  "AI-generated study content is for educational purposes and should be verified with trusted medical textbooks and official clinical guidelines.";

function planToText(subject: string, topic: string, days: StudyPlanDay[], tip: string) {
  const header = `Study Plan — ${subject}: ${topic}\n\n`;
  const body = days
    .map(
      (d) =>
        `Day ${d.day} — ${d.focus}\n` +
        `  Topics: ${d.topics.join(", ")}\n` +
        `  Key concepts: ${d.key_concepts.join(", ")}\n` +
        `  Revision: ${d.revision_task}\n` +
        `  Practice: ${d.practice}\n`,
    )
    .join("\n");
  return `${header}${body}\nTip: ${tip}\n\n${DISCLAIMER}`;
}

function StudyAIPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const generate = useServerFn(generateStudyPlan);

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("Beginner");
  const [dailyHours, setDailyHours] = useState(2);
  const [days, setDays] = useState(7);
  const [examDate, setExamDate] = useState("");
  const [current, setCurrent] = useState<StudyPlanResult | null>(null);
  const [toDelete, setToDelete] = useState<SavedPlan | null>(null);

  const { data: saved, isLoading } = useQuery({
    queryKey: ["study-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SavedPlan[];
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!subject.trim() || !topic.trim()) {
        throw new Error("Please enter both subject and topic.");
      }
      return generate({
        data: {
          subject: subject.trim(),
          topic: topic.trim(),
          difficulty,
          daily_hours: dailyHours,
          days,
          exam_date: examDate || null,
        },
      });
    },
    onSuccess: (res) => {
      setCurrent(res);
      toast.success("Study plan generated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Generation failed"),
  });

  async function handleSave() {
    if (!current || !user) return;
    const { error } = await supabase.from("study_plans").insert({
      user_id: user.id,
      subject: subject.trim(),
      topic: topic.trim(),
      difficulty,
      daily_hours: dailyHours,
      days,
      exam_date: examDate || null,
      plan: current.days as unknown as never,
      tip: current.tip,
    });
    if (error) return toast.error(error.message);
    toast.success("Plan saved");
    qc.invalidateQueries({ queryKey: ["study-plans"] });
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(null);
    const { error } = await supabase.from("study_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plan deleted");
    qc.invalidateQueries({ queryKey: ["study-plans"] });
  }

  function loadIntoForm(p: SavedPlan) {
    setSubject(p.subject);
    setTopic(p.topic);
    setDifficulty((DIFFICULTIES.find((d) => d === p.difficulty) as typeof difficulty) ?? "Beginner");
    setDailyHours(Number(p.daily_hours));
    setDays(p.days);
    setExamDate(p.exam_date ?? "");
    setCurrent({ days: p.plan, tip: p.tip ?? "" });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" /> Curo Study AI
          </h1>
          <p className="mt-1 text-muted-foreground">
            Personalized, day-by-day study plans for medical and healthcare topics.
          </p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">Create a study plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g. Anatomy, Pharmacology"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  placeholder="e.g. Cardiovascular system"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hours">Hours / day</Label>
                  <Input
                    id="hours"
                    type="number"
                    min={0.5}
                    max={16}
                    step={0.5}
                    value={dailyHours}
                    onChange={(e) => setDailyHours(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days">Days</Label>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exam">Exam date (optional)</Label>
                <Input
                  id="exam"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {current ? "Regenerate" : "Generate plan"}
              </Button>
              {current && (
                <>
                  <Button variant="outline" onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleCopy(planToText(subject, topic, current.days, current.tip))}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
          </CardContent>
        </Card>

        {current && (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">
                {subject}: {topic}
                <Badge variant="secondary" className="ml-2">{difficulty}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {current.days.map((d) => (
                <div key={d.day} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Day {d.day} — {d.focus}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="font-medium text-foreground">Topics to study</p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {d.topics.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Key concepts</p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {d.key_concepts.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Revision task</p>
                      <p className="mt-1 text-muted-foreground">{d.revision_task}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Practice / Quiz</p>
                      <p className="mt-1 text-muted-foreground">{d.practice}</p>
                    </div>
                  </div>
                </div>
              ))}
              {current.tip && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm">
                  <p className="font-semibold text-primary">Exam tip</p>
                  <p className="mt-1 text-muted-foreground">{current.tip}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div>
          <h2 className="mb-3 text-lg font-semibold">Your saved plans</h2>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : !saved || saved.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No saved plans yet"
              description="Generate a plan above and save it to build your personal study library."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((p) => (
                <Card key={p.id} className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{p.subject}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{p.topic}</p>
                      </div>
                      <Badge variant="secondary">{p.difficulty}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p.days} days · {Number(p.daily_hours)} h/day · {new Date(p.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => loadIntoForm(p)}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Open
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCopy(planToText(p.subject, p.topic, p.plan, p.tip ?? ""))
                        }
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setToDelete(p)}
                        aria-label="Delete"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this study plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{toDelete?.subject}: {toDelete?.topic}”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
