import { generateText } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "./ai-provider.server";
import { retrieveGrounding, GROUNDING_RULES, type Grounding } from "./rag.server";

/**
 * AI Health Insights. Read-only: organises the signed-in user's own health
 * information into evidence-based observations. Never diagnoses, never
 * prescribes, never invents facts or citations.
 *
 * Reuses the existing AI provider (withAiFallback) and the existing Hybrid RAG
 * layer — no new AI implementation.
 */

export const HEALTH_INSIGHTS_DISCLAIMER =
  "AI-generated health insights are for informational purposes only and are not a medical diagnosis or substitute for professional medical advice.";

/** Exact wording required when no document supports an observation. */
export const NO_DOCUMENT_NOTE =
  "No matching uploaded document was found to support this observation.";

export type InsightModule = "records" | "medicines" | "appointments" | "timeline";

export type InsightItem = {
  title: string;
  explanation: string;
  /** Category badge shown in the UI. */
  category: string;
  supporting: string[];
  source: string | null;
  /** Date of the underlying information, not of the insight itself. */
  date: string | null;
  link: string | null;
};

export type HealthInsights = {
  generated_at: string;
  record_observations: InsightItem[];
  medication_activity: InsightItem[];
  health_activity: InsightItem[];
  document_insights: InsightItem[];
  disclaimer: string;
};

const LINK_BY_MODULE: Record<InsightModule, string | null> = {
  records: "/health-records",
  medicines: "/medicines",
  appointments: "/appointments",
  timeline: "/health-timeline",
};

const CATEGORY_BY_SECTION: Record<string, string> = {
  record_observations: "Health Record",
  medication_activity: "Medication",
  health_activity: "Activity",
  document_insights: "Document",
};

const NOT_ENOUGH = "Not enough information available.";

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/** Abnormal finding labels, whether the items are strings or {label} objects. */
function abnormalLabels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : String((x as Record<string, unknown>)?.["label"] ?? "")))
    .filter(Boolean)
    .slice(0, 6);
}

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1]! : text).trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct) return direct;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const slice = candidate.slice(first, last + 1);
    return tryParse(slice) ?? tryParse(slice.replace(/,\s*([}\]])/g, "$1"));
  }
  return null;
}

// ---------- AI output schema ----------

const ItemSchema = z.object({
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(1200),
  supporting: z.array(z.string().max(400)).max(6).default([]),
  source: z.string().max(300).nullable().optional(),
  date: z.string().max(60).nullable().optional(),
  module: z.enum(["records", "medicines", "appointments", "timeline"]).catch("timeline"),
});

const AiSchema = z.object({
  record_observations: z.array(ItemSchema).max(6).catch([]),
  medication_activity: z.array(ItemSchema).max(6).catch([]),
  health_activity: z.array(ItemSchema).max(6).catch([]),
  document_insights: z.array(ItemSchema).max(6).catch([]),
});

// ---------- Data gathering (read-only, RLS-scoped) ----------

type Gathered = {
  records: { id: string; title: string; record_type: string | null; record_date: string | null; uploaded_at: string; notes: string | null }[];
  analyses: { record_id: string; summary: string | null; key_findings: unknown; abnormal: unknown; created_at: string }[];
  medicines: { id: string; medicine_name: string; strength: string | null; dosage: string | null; frequency: string | null }[];
  doses: { scheduled_date: string; scheduled_time: string; status: string | null; medicines: { medicine_name: string } | null }[];
  appointments: { id: string; doctor_name: string; hospital_name: string | null; appointment_date: string; appointment_time: string | null }[];
  today: string;
};

async function gatherData(supabase: SupabaseClient<Database>, userId: string): Promise<Gathered> {
  const today = new Date().toISOString().slice(0, 10);
  const [records, analyses, medicines, doses, appointments] = await Promise.all([
    supabase
      .from("health_records")
      .select("id, title, record_type, record_date, uploaded_at, notes")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false })
      .limit(8),
    supabase
      .from("health_record_analyses")
      .select("record_id, summary, key_findings, abnormal, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("medicines")
      .select("id, medicine_name, strength, dosage, frequency")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("medicine_doses")
      .select("scheduled_date, scheduled_time, status, medicines(medicine_name)")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: false })
      .limit(60),
    supabase
      .from("appointments")
      .select("id, doctor_name, hospital_name, appointment_date, appointment_time")
      .eq("user_id", userId)
      .order("appointment_date", { ascending: true })
      .limit(10),
  ]);

  return {
    records: (records.data ?? []) as Gathered["records"],
    analyses: (analyses.data ?? []) as Gathered["analyses"],
    medicines: (medicines.data ?? []) as Gathered["medicines"],
    doses: (doses.data ?? []) as unknown as Gathered["doses"],
    appointments: (appointments.data ?? []) as Gathered["appointments"],
    today,
  };
}

function doseCounts(doses: Gathered["doses"]): { taken: number; missed: number; skipped: number; upcoming: number } {
  const counts = { taken: 0, missed: 0, skipped: 0, upcoming: 0 };
  for (const d of doses) {
    if (d.status === "taken") counts.taken++;
    else if (d.status === "missed") counts.missed++;
    else if (d.status === "skipped") counts.skipped++;
    else counts.upcoming++;
  }
  return counts;
}

// ---------- Deterministic fallbacks (used when the AI omits a section) ----------

function fallbackRecordInsights(d: Gathered): InsightItem[] {
  const items: InsightItem[] = [];
  const titleByRecord = new Map(d.records.map((r) => [r.id, r.title]));
  for (const a of d.analyses) {
    const findings = asStrings(a.key_findings);
    const abnormal = abnormalLabels(a.abnormal);
    const supporting = [...findings, ...abnormal.map((x) => `Flagged: ${x}`)].slice(0, 5);
    if (!a.summary && !supporting.length) continue;
    items.push({
      title: titleByRecord.get(a.record_id) ?? "Saved health record analysis",
      explanation: a.summary?.trim() || "Findings documented in a saved AI analysis of your record.",
      category: CATEGORY_BY_SECTION["record_observations"]!,
      supporting,
      source: "Your saved AI record analysis",
      date: a.created_at.slice(0, 10),
      link: LINK_BY_MODULE.records,
    });
  }
  return items.slice(0, 4);
}

function fallbackMedicationInsights(d: Gathered): InsightItem[] {
  if (!d.medicines.length && !d.doses.length) return [];
  const counts = doseCounts(d.doses);
  const recorded = counts.taken + counts.missed + counts.skipped;
  const explanation =
    recorded > 0
      ? `Across your ${recorded} recorded doses, ${counts.taken} were marked taken, ${counts.missed} missed and ${counts.skipped} skipped.`
      : "No dose outcomes recorded yet — marking doses in the Medicines page builds your adherence history.";
  return [
    {
      title: "Medication activity summary",
      explanation,
      category: CATEGORY_BY_SECTION["medication_activity"]!,
      supporting: d.medicines.slice(0, 6).map((m) => `${m.medicine_name}${m.strength ? ` ${m.strength}` : ""}${m.frequency ? ` — ${m.frequency}` : ""}`),
      source: "Your medicines and dose history",
      date: d.doses[0]?.scheduled_date ?? null,
      link: LINK_BY_MODULE.medicines,
    },
  ];
}

function fallbackActivityInsights(d: Gathered): InsightItem[] {
  const items: InsightItem[] = [];
  const upcoming = d.appointments.filter((a) => a.appointment_date >= d.today);
  for (const a of upcoming.slice(0, 2)) {
    items.push({
      title: `Upcoming appointment with ${a.doctor_name}`,
      explanation: `Scheduled for ${a.appointment_date}${a.appointment_time ? ` at ${a.appointment_time}` : ""}${a.hospital_name ? ` at ${a.hospital_name}` : ""}.`,
      category: CATEGORY_BY_SECTION["health_activity"]!,
      supporting: [],
      source: "Your appointments",
      date: a.appointment_date,
      link: LINK_BY_MODULE.appointments,
    });
  }
  for (const r of d.records.slice(0, 2)) {
    items.push({
      title: r.title,
      explanation: r.record_type ? `${r.record_type} added to your health records.` : "Health record added.",
      category: CATEGORY_BY_SECTION["health_activity"]!,
      supporting: [],
      source: "Your health records",
      date: r.record_date ?? r.uploaded_at.slice(0, 10),
      link: LINK_BY_MODULE.records,
    });
  }
  return items;
}

function documentItemsFromGrounding(g: Grounding): InsightItem[] {
  const seen = new Set<string>();
  const items: InsightItem[] = [];
  for (const c of g.chunks) {
    const cite = `${c.metadata.source}: ${c.metadata.document_title}`;
    if (seen.has(cite)) continue;
    seen.add(cite);
    const snippet = c.content.replace(/\s+/g, " ").slice(0, 240).trim();
    items.push({
      title: c.metadata.section ? `${cite} — ${c.metadata.section}` : cite,
      explanation: snippet || "Retrieved from your uploaded documents.",
      category: CATEGORY_BY_SECTION["document_insights"]!,
      supporting: c.metadata.page ? [`Page: ${c.metadata.page}`] : [],
      source: cite,
      date: null,
      link: null,
    });
    if (items.length >= 4) break;
  }
  return items;
}

// ---------- Main builder ----------

export async function buildHealthInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HealthInsights> {
  const d = await gatherData(supabase, userId);

  // Hybrid RAG over the user's own uploaded documents (existing layer).
  const ragQuery = [
    ...d.records.slice(0, 4).map((r) => r.title),
    ...d.analyses.flatMap((a) => abnormalLabels(a.abnormal)),
    ...d.medicines.slice(0, 3).map((m) => m.medicine_name),
  ]
    .join(", ")
    .slice(0, 800);

  let grounding: Grounding = { context: "", sources: [], used: false, chunks: [] };
  if (ragQuery.trim()) {
    try {
      grounding = await retrieveGrounding(supabase, userId, ragQuery, 4);
    } catch (err) {
      console.error("[insights] RAG retrieval failed:", (err as Error)?.message);
    }
  }

  const counts = doseCounts(d.doses);
  const medicineLines = d.medicines.map(
    (m) => `${m.medicine_name}${m.strength ? ` ${m.strength}` : ""}${m.dosage ? ` — ${m.dosage}` : ""}${m.frequency ? ` (${m.frequency})` : ""}`,
  );
  const recordLines = d.records.map(
    (r) => `${r.title}${r.record_type ? ` [${r.record_type}]` : ""} — ${r.record_date ?? r.uploaded_at.slice(0, 10)}${r.notes ? ` — notes: ${r.notes}` : ""}`,
  );
  const findingLines = d.analyses.flatMap((a) =>
    [a.summary ?? "", ...asStrings(a.key_findings), ...abnormalLabels(a.abnormal).map((x) => `Flagged: ${x}`)].filter(Boolean),
  );
  const upcoming = d.appointments.filter((a) => a.appointment_date >= d.today);
  const past = d.appointments.filter((a) => a.appointment_date < d.today);

  const facts = [
    `Medicines currently recorded: ${medicineLines.length ? `\n- ${medicineLines.join("\n- ")}` : "none"}.`,
    `Recent dose outcomes: ${counts.taken} taken, ${counts.missed} missed, ${counts.skipped} skipped, ${counts.upcoming} upcoming/not yet marked.`,
    `Recent health records: ${recordLines.length ? `\n- ${recordLines.join("\n- ")}` : "none"}.`,
    `Saved AI record-analysis notes: ${findingLines.length ? `\n- ${findingLines.slice(0, 12).join("\n- ")}` : "none"}.`,
    `Upcoming appointments: ${upcoming.length ? upcoming.map((a) => `${a.doctor_name} on ${a.appointment_date}${a.appointment_time ? ` at ${a.appointment_time}` : ""}`).join("; ") : "none"}.`,
    `Past appointments: ${past.length ? past.map((a) => `${a.doctor_name} on ${a.appointment_date}`).join("; ") : "none"}.`,
  ].join("\n\n");

  const documentBlock = grounding.used
    ? `${GROUNDING_RULES}\n\n${grounding.context}`
    : `\n\n(No matching uploaded document was retrieved. For document_insights, return an item whose explanation is exactly "${NO_DOCUMENT_NOTE}".)`;

  const prompt = `Organise the patient's OWN saved health information below into evidence-based observations.

STRICT RULES:
- Use only facts present in the information below. Never invent symptoms, values, medicines, appointments or document content.
- Do NOT diagnose, do NOT prescribe, do NOT recommend changing, starting or stopping any medication, and do NOT make treatment decisions.
- Present uncertain observations as observations ("documented", "recorded"), never as confirmed medical facts.
- If a section has no supporting information, return exactly [{"title":"${NOT_ENOUGH}","explanation":"${NOT_ENOUGH}","supporting":[],"module":"timeline"}] for it.
- document_insights must be supported ONLY by the retrieved reference material, and each item's source must be one of the citation lines given there${grounding.used ? "" : ` (none were retrieved — use "${NO_DOCUMENT_NOTE}")`}.

PATIENT INFORMATION:
${facts}

RETRIEVED REFERENCE MATERIAL:
${documentBlock}

Return ONLY valid JSON (no markdown fences) matching:
{
  "record_observations": [{"title": "string", "explanation": "string", "supporting": ["string"], "source": "string|null", "date": "string|null", "module": "records"}],
  "medication_activity": [{"title": "string", "explanation": "string", "supporting": ["string"], "source": "string|null", "date": "string|null", "module": "medicines"}],
  "health_activity": [{"title": "string", "explanation": "string", "supporting": ["string"], "source": "string|null", "date": "string|null", "module": "appointments|timeline"}],
  "document_insights": [{"title": "string", "explanation": "string", "supporting": ["string"], "source": "string|null", "date": "string|null", "module": "timeline"}]
}`;

  let parsed: Record<string, unknown> = {};
  try {
    const text = await withAiFallback(async (model) => {
      const res = await generateText({
        model,
        system: MEDICAL_SAFETY_SYSTEM,
        prompt,
        maxOutputTokens: 1800,
      });
      return res.text;
    });
    parsed = (extractJsonObject(text) as Record<string, unknown>) ?? {};
  } catch (err) {
    console.error("[insights] AI call failed:", (err as Error)?.message);
  }

  const ai = AiSchema.safeParse(parsed);
  const section = (key: keyof z.infer<typeof AiSchema>, fallback: InsightItem[]): InsightItem[] => {
    const items = ai.success ? ai.data[key] : [];
    const valid = items.filter(
      (i) =>
        i.title.trim() &&
        i.explanation.trim() &&
        i.explanation.trim() !== NOT_ENOUGH &&
        i.title.trim() !== NOT_ENOUGH,
    );
    const mapped: InsightItem[] = valid.map((i) => ({
      title: i.title.trim(),
      explanation: i.explanation.trim(),
      category: CATEGORY_BY_SECTION[key]!,
      supporting: i.supporting,
      source: i.source?.trim() || null,
      date: i.date?.trim() || null,
      link: LINK_BY_MODULE[i.module] ?? null,
    }));
    return mapped.length ? mapped : fallback;
  };

  // Hallucination guard: document insights may only cite retrieved documents.
  let documentFallback: InsightItem[];
  if (grounding.used) {
    documentFallback = documentItemsFromGrounding(grounding);
  } else {
    documentFallback = [
      {
        title: "Document-supported insights",
        explanation: NO_DOCUMENT_NOTE,
        category: CATEGORY_BY_SECTION["document_insights"]!,
        supporting: [],
        source: null,
        date: null,
        link: null,
      },
    ];
  }
  let documentInsights = section("document_insights", documentFallback);
  if (grounding.used) {
    const allowed = new Set([...grounding.sources, ...documentFallback.map((i) => i.source ?? "")]);
    const filtered = documentInsights.filter((i) => !i.source || allowed.has(i.source));
    documentInsights = filtered.length ? filtered : documentFallback;
  } else {
    // Nothing was retrieved: force the exact no-match note.
    documentInsights = documentFallback;
  }

  return {
    generated_at: new Date().toISOString(),
    record_observations: section("record_observations", fallbackRecordInsights(d)),
    medication_activity: section("medication_activity", fallbackMedicationInsights(d)),
    health_activity: section("health_activity", fallbackActivityInsights(d)),
    document_insights: documentInsights,
    disclaimer: HEALTH_INSIGHTS_DISCLAIMER,
  };
}

/** Markdown rendering used by the agent tool. */
export function healthInsightsToMarkdown(h: HealthInsights): string {
  const sec = (title: string, items: InsightItem[]) =>
    `**${title}**\n${items.map((i) => `- **${i.title}** — ${i.explanation}${i.source ? ` _(Source: ${i.source})_` : ""}`).join("\n")}`;
  return [
    `### AI Health Insights\n_Generated ${new Date(h.generated_at).toLocaleString()}_`,
    sec("Health Record Observations", h.record_observations),
    sec("Medication Activity", h.medication_activity),
    sec("Health Activity", h.health_activity),
    sec("Document-Supported Insights", h.document_insights),
    `_${h.disclaimer}_`,
  ].join("\n\n");
}
