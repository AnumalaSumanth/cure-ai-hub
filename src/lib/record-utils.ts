import {
  FileText,
  FlaskConical,
  Pill,
  Scan,
  Hospital,
  StickyNote,
  Syringe,
  type LucideIcon,
} from "lucide-react";

export const RECORD_TYPES = [
  "Blood Test",
  "Prescription",
  "X-Ray / Scan",
  "Hospital Report",
  "Doctor Note",
  "Vaccination",
  "Other",
] as const;

export function recordIcon(type: string | null | undefined): LucideIcon {
  const t = (type ?? "").toLowerCase();
  if (t.includes("blood") || t.includes("urine") || t.includes("test")) return FlaskConical;
  if (t.includes("prescription")) return Pill;
  if (t.includes("x-ray") || t.includes("scan") || t.includes("mri") || t.includes("ct")) return Scan;
  if (t.includes("hospital") || t.includes("discharge")) return Hospital;
  if (t.includes("note")) return StickyNote;
  if (t.includes("vaccin")) return Syringe;
  return FileText;
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}
