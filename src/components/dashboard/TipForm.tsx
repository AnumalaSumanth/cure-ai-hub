import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type TipStatus = "Draft" | "Published" | "Archived";

export interface TipFormValues {
  title: string;
  category: string;
  content: string;
  target_audience: string;
  tags: string[];
  status: TipStatus;
  notes: string;
}

interface TipFormProps {
  initial?: Partial<TipFormValues>;
  submitLabel: string;
  onSubmit: (values: TipFormValues) => Promise<void>;
  onCancel?: () => void;
}

export function TipForm({ initial, submitLabel, onSubmit, onCancel }: TipFormProps) {
  const [status, setStatus] = useState<TipStatus>(initial?.status ?? "Draft");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const content = String(fd.get("content") ?? "").trim();
    if (!title) return toast.error("Title is required");
    if (title.length > 200) return toast.error("Title must be under 200 characters");
    if (!content) return toast.error("Content is required");
    if (content.length > 10000) return toast.error("Content is too long");

    const tags = String(fd.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    setSaving(true);
    try {
      await onSubmit({
        title,
        category: String(fd.get("category") ?? "").trim(),
        content,
        target_audience: String(fd.get("target_audience") ?? "").trim(),
        tags,
        status,
        notes: String(fd.get("notes") ?? "").trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" name="title" defaultValue={initial?.title ?? ""} required maxLength={200} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" defaultValue={initial?.category ?? ""} placeholder="e.g. Nutrition" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target_audience">Target audience</Label>
          <Input
            id="target_audience"
            name="target_audience"
            defaultValue={initial?.target_audience ?? ""}
            placeholder="e.g. Adults, Diabetics"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">Content *</Label>
        <Textarea
          id="content"
          name="content"
          defaultValue={initial?.content ?? ""}
          required
          rows={8}
          maxLength={10000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={initial?.tags?.join(", ") ?? ""}
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

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={3} maxLength={2000} />
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
