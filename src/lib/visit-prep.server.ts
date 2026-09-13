import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "./ai-provider.server";

export const VISIT_PREP_DISCLAIMER =
  "AI-generated preparation. This is not a diagnosis or medical advice. Discuss health concerns and treatment decisions with a qualified healthcare professional.";

export type VisitPrep = {
  appointment: {
    id: string;
    doctor_name: string;
    hospital_name: string | null;
    appointment_date: string;
    appointment_time: string | null;
  };
  main_concerns: string[];
  recent_information: string[];
  current_medicines: string[];
  recent_records: string[];
  important_findings: string[];
  questions_to_ask: string[];
  things_to_mention: string[];
  disclaimer: string;
};

const NOT_ENOUGH = "Not enough information available.";

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1]! : text).trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
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

/**
 * Builds a read-only doctor-visit preparation summary from the signed-in
 * user's own records. Never writes, never diagnoses, never invents data.
 */
export async function buildVisitPrep(
  supabase: SupabaseClient<Database>,
  userId: string,
  appointmentId: string,
): Promise<VisitPrep> {
  const { data: appt, error } = await supabase
    .from("appointments")
    .select("id, doctor_name, hospital_name, appointment_date, appointment_time, notes")
    .eq("user_id", userId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !appt) throw new Error("Appointment not found.");

  const [meds, records, analyses] = await Promise.all([
    supabase
      .from("medicines")
      .select("medicine_name, dosage, strength, frequency, notes")
      .eq("user_id", userId)
      .limit(20),
    supabase
      .from("health_records")
      .select("id, title, record_type, record_date, uploaded_at, notes")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: false })
      .limit(6),
    supabase
      .from("health_record_analyses")
      .select("summary, key_findings, abnormal, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const medicineLines = (meds.data ?? []).map(
    (m) =>
      `${m.medicine_name}${m.strength ? ` ${m.strength}` : ""}${m.dosage ? ` — ${m.dosage}` : ""}${
        m.frequency ? ` (${m.frequency})` : ""
      }`,
  );
  const recordLines = (records.data ?? []).map(
    (r) => `${r.title}${r.record_type ? ` [${r.record_type}]` : ""} — ${r.record_date ?? r.uploaded_at.slice(0, 10)}`,
  );
  const findingLines = (analyses.data ?? []).flatMap((a) => {
    const findings = asStrings(a.key_findings);
    const abnormal = Array.isArray(a.abnormal)
      ? (a.abnormal as unknown[]).map((x) =>
          typeof x === "string" ? x : String((x as Record<string, unknown>)?.["label"] ?? ""),
        ).filter(Boolean)
      : [];
    return [...(a.summary ? [a.summary] : []), ...findings, ...abnormal];
  });

  const context = [
    `Appointment: Dr. ${appt.doctor_name}${appt.hospital_name ? ` at ${appt.hospital_name}` : ""} on ${appt.appointment_date}${appt.appointment_time ? ` at ${appt.appointment_time}` : ""}.`,
    appt.notes ? `Appointment notes: ${appt.notes}` : "",
    medicineLines.length ? `Current medicines:\n- ${medicineLines.join("\n- ")}` : "Current medicines: none recorded.",
    recordLines.length ? `Recent health records:\n- ${recordLines.join("\n- ")}` : "Recent health records: none recorded.",
    findingLines.length
      ? `Saved AI record analysis notes:\n- ${findingLines.slice(0, 12).join("\n- ")}`
      : "Saved AI record analysis notes: none.",
    (records.data ?? []).some((r) => r.notes)
      ? `User notes on records:\n- ${(records.data ?? []).filter((r) => r.notes).map((r) => `${r.title}: ${r.notes}`).join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `Organise the patient's OWN saved information below into a doctor-visit preparation summary.

STRICT RULES:
- Use only facts present in the information below. Never invent symptoms, values, diagnoses or medicines.
- Do not diagnose, do not prescribe, do not suggest changing or stopping any medication.
- If a section has no supporting information, return exactly ["${NOT_ENOUGH}"] for it.
- Questions must be things the patient can ask their doctor, not answers.

PATIENT INFORMATION:
${context}

Return ONLY valid JSON (no markdown fences) matching:
{
  "main_concerns": ["string"],
  "recent_information": ["string"],
  "current_medicines": ["string"],
  "recent_records": ["string"],
  "important_findings": ["string"],
  "questions_to_ask": ["string"],
  "things_to_mention": ["string"]
}`;

  let parsed: Record<string, unknown> = {};
  try {
    const text = await withAiFallback(async (model) => {
      const res = await generateText({
        model,
        system: MEDICAL_SAFETY_SYSTEM,
        prompt,
        maxOutputTokens: 1200,
      });
      return res.text;
    });
    parsed = (extractJsonObject(text) as Record<string, unknown>) ?? {};
  } catch (err) {
    console.error("[visit-prep] AI failed:", (err as Error)?.message);
  }

  const fill = (v: unknown, fallback: string[]) => {
    const list = asStrings(v).filter((s) => s !== NOT_ENOUGH);
    if (list.length) return list;
    return fallback.length ? fallback : [NOT_ENOUGH];
  };

  return {
    appointment: {
      id: appt.id,
      doctor_name: appt.doctor_name,
      hospital_name: appt.hospital_name,
      appointment_date: appt.appointment_date,
      appointment_time: appt.appointment_time,
    },
    main_concerns: fill(parsed["main_concerns"], appt.notes ? [appt.notes] : []),
    recent_information: fill(parsed["recent_information"], []),
    current_medicines: fill(parsed["current_medicines"], medicineLines),
    recent_records: fill(parsed["recent_records"], recordLines),
    important_findings: fill(parsed["important_findings"], findingLines.slice(0, 6)),
    questions_to_ask: fill(parsed["questions_to_ask"], []),
    things_to_mention: fill(parsed["things_to_mention"], []),
    disclaimer: VISIT_PREP_DISCLAIMER,
  };
}

/** Markdown rendering used by the agent tool. */
export function visitPrepToMarkdown(p: VisitPrep): string {
  const sec = (title: string, items: string[], numbered = false) =>
    `**${title}**\n${items.map((s, i) => (numbered ? `${i + 1}. ${s}` : `- ${s}`)).join("\n")}`;
  return [
    `### Doctor Visit Preparation`,
    `**Dr. ${p.appointment.doctor_name}**${p.appointment.hospital_name ? ` · ${p.appointment.hospital_name}` : ""}\n${p.appointment.appointment_date}${p.appointment.appointment_time ? ` at ${p.appointment.appointment_time}` : ""}`,
    sec("Main Concerns", p.main_concerns),
    sec("Recent Information", p.recent_information),
    sec("Current Medicines", p.current_medicines),
    sec("Recent Health Records", p.recent_records),
    sec("Important Findings", p.important_findings),
    sec("Questions to Ask", p.questions_to_ask, true),
    sec("Things to Mention", p.things_to_mention),
  ].join("\n\n");
}
