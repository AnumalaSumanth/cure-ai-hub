import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Upload,
  Loader2,
  ShieldAlert,
  Stethoscope,
  AlertTriangle,
  HeartPulse,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import {
  analyzeHealthImage,
  DISCLAIMER,
  type ImageAnalysisResult,
} from "@/lib/image-analysis.functions";

export const Route = createFileRoute("/_authenticated/image-analysis")({
  head: () => ({
    meta: [
      { title: "Image Health Analysis — Cure AI" },
      {
        name: "description",
        content:
          "Upload or capture a photo of a wound, rash or skin concern and get cautious, educational guidance. Not a medical diagnosis.",
      },
      { property: "og:title", content: "Image Health Analysis — Cure AI" },
      {
        property: "og:description",
        content:
          "Educational image-based health guidance with severity, self-care tips and warning signs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImageAnalysisPage,
});

const BUCKET = "medical-library";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

const severityStyles: Record<ImageAnalysisResult["severity"], string> = {
  low: "bg-secondary/15 text-secondary-foreground border-secondary/40",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400",
  high: "bg-destructive/15 text-destructive border-destructive/40",
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });
}

function ImageAnalysisPage() {
  const { user } = useUser();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeFn = useServerFn(analyzeHealthImage);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("Image is too large (max 8MB).");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(URL.createObjectURL(f));
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setNote("");
  }

  const analysis = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error("Please choose an image first.");

      // Securely store the photo in the user's private folder.
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/image-analysis/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("Secure upload failed. Please try again.");

      const imageDataUrl = await readAsDataUrl(file);
      return (await analyzeFn({
        data: { imageDataUrl, note: note.trim() || undefined },
      })) as ImageAnalysisResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: Error) => {
      setResult(null);
      setError(err.message || "Something went wrong. Please try again.");
      toast.error(err.message || "Analysis failed");
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Camera className="h-6 w-6 text-primary" /> Image Health Analysis
          </h1>
          <p className="text-sm text-muted-foreground">
            Take or upload a photo of a wound, rash or visible skin concern for cautious,
            educational guidance.
          </p>
        </header>

        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            <strong>{DISCLAIMER}</strong> Cure AI cannot see everything a clinician can. If you feel
            unwell, or the area is worsening, seek professional medical care.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Add a photo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => cameraRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" /> Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload image
                </Button>
                {file && (
                  <Button type="button" variant="ghost" onClick={reset}>
                    <X className="mr-2 h-4 w-4" /> Clear
                  </Button>
                )}
              </div>

              {preview && (
                <img
                  src={preview}
                  alt="Selected photo of the skin concern to be analysed"
                  className="max-h-72 w-full rounded-lg border object-contain"
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="note">Anything to add? (optional)</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. itchy for 3 days, no fever"
                />
              </div>

              <Button
                className="w-full"
                disabled={!file || analysis.isPending}
                onClick={() => analysis.mutate()}
              >
                {analysis.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…
                  </>
                ) : (
                  <>
                    <HeartPulse className="mr-2 h-4 w-4" /> Analyze image
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysis.isPending && (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              )}

              {!analysis.isPending && error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>{error}</span>
                </div>
              )}

              {!analysis.isPending && !error && !result && (
                <p className="text-sm text-muted-foreground">
                  Your results will appear here after analysis.
                </p>
              )}

              {!analysis.isPending && result && (
                <div className="space-y-5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Severity</span>
                    <Badge variant="outline" className={severityStyles[result.severity]}>
                      {result.severity.toUpperCase()}
                    </Badge>
                  </div>

                  {result.severity === "high" && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="font-medium text-destructive">
                        This may need urgent care. Please seek immediate medical attention or contact
                        local emergency services.
                      </p>
                    </div>
                  )}

                  {result.summary && <p>{result.summary}</p>}

                  <Section title="Possible conditions (not a diagnosis)" items={result.possible_conditions} />
                  <Section title="Basic self-care suggestions" items={result.self_care} />
                  <Section title="Warning signs to watch for" items={result.warning_signs} />

                  <div className="space-y-1">
                    <h3 className="flex items-center gap-2 font-medium">
                      <Stethoscope className="h-4 w-4 text-primary" /> Should you see a doctor?
                    </h3>
                    <p className="text-muted-foreground">{result.doctor_recommendation}</p>
                  </div>

                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    {DISCLAIMER} This guidance is educational only — always confirm with a qualified
                    healthcare professional.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <h3 className="font-medium">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
