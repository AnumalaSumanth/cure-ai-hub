import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Wand2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { generateTip, improveTip } from "@/lib/tips-ai.functions";
import { TIP_CATEGORIES } from "@/lib/health-tips-utils";

export type TipStatus = "Draft" | "Published" | "Archived";

export interface TipFormValues {
  title: string;
  category: string;
  content: string;
  target_audience: string;
  tags: string[];
  status: TipStatus;
  notes: string;
  is_featured: boolean;
}

interface TipFormProps {
  initial?: Partial<TipFormValues>;
  submitLabel: string;
  onSubmit: (values: TipFormValues) => Promise<void>;
  onCancel?: () => void;
}

export function TipForm({ initial, submitLabel, onSubmit, onCancel }: TipFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [audience, setAudience] = useState(initial?.target_audience ?? "");
  const [tagsStr, setTagsStr] = useState((initial?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<TipStatus>(initial?.status ?? "Draft");
  const [isFeatured, setIsFeatured] = useState(initial?.is_featured ?? false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [improving, setImproving] = useState(false);

  const generate = useServerFn(generateTip);
  const improve = useServerFn(improveTip);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generate({ data: { topic: title || category || undefined } });
      setTitle(res.title);
      setCategory(res.category);
      setContent(res.content);
      setAudience(res.target_audience);
      setTagsStr(res.tags.join(", "));
      toast.success("AI draft ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleImprove() {
    if (!content.trim()) return toast.error("Add some content first");
    setImproving(true);
    try {
      const res = await improve({ data: { content } });
      setContent(res.content);
      toast.success("Content improved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Improve failed");
    } finally {
      setImproving(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required");
    if (title.length > 200) return toast.error("Title must be under 200 characters");
    if (!content.trim()) return toast.error("Content is required");
    if (content.length > 10000) return toast.error("Content is too long");

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        category: category.trim(),
        content: content.trim(),
        target_audience: audience.trim(),
        tags,
        status,
        notes: notes.trim(),
        is_featured: isFeatured,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate with AI
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleImprove} disabled={improving || !content.trim()}>
          {improving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          Improve with AI
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            list="tip-category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Nutrition"
          />
          <datalist id="tip-category-suggestions">
            {TIP_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target_audience">Target audience</Label>
          <Input
            id="target_audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. Adults, Diabetics"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">Content *</Label>
        <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} required rows={10} maxLength={10000} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="comma, separated, tags"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TipStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Published">Published</SelectItem>
              <SelectItem value="Archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <Star className={`h-4 w-4 ${isFeatured ? "fill-warning text-warning" : "text-muted-foreground"}`} />
          <div>
            <p className="text-sm font-medium">Feature this tip</p>
            <p className="text-xs text-muted-foreground">Pin it to the top of your tips list. Only one can be featured at a time.</p>
          </div>
        </div>
        <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
