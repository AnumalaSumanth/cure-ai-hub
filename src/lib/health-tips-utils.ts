export const TIP_CATEGORIES = [
  "Nutrition",
  "Exercise",
  "Mental Health",
  "Sleep",
  "Hydration",
  "Diabetes",
  "Heart Health",
  "Women's Health",
  "Children's Health",
  "Senior Care",
  "General Wellness",
] as const;

export function readingTimeMinutes(content: string | null | undefined): number {
  if (!content) return 1;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
