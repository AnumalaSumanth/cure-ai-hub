/**
 * Curated trusted medical reference notes.
 *
 * These are short, general, public-health-style summaries used as retrieval
 * material alongside the user's own Medical Library so answers are grounded in
 * vetted text rather than only the model's internal knowledge.
 * They are educational, never diagnostic, and contain no dosages.
 */

export type TrustedNote = {
  id: string;
  title: string;
  source: string;
  keywords: string[];
  text: string;
};

export const TRUSTED_NOTES: TrustedNote[] = [
  {
    id: "hba1c",
    title: "HbA1c (glycated haemoglobin)",
    source: "Trusted medical reference — diabetes basics",
    keywords: ["hba1c", "a1c", "glycated", "diabetes", "blood sugar", "glucose"],
    text: "HbA1c reflects average blood glucose over roughly the previous two to three months. It is reported as a percentage or in mmol/mol. Higher values suggest higher average glucose. Clinicians interpret it alongside symptoms, other tests and personal history; a single value is not a diagnosis on its own.",
  },
  {
    id: "bp",
    title: "Blood pressure readings",
    source: "Trusted medical reference — cardiovascular basics",
    keywords: ["blood pressure", "bp", "hypertension", "systolic", "diastolic"],
    text: "Blood pressure is written as systolic over diastolic in mmHg. Readings vary through the day and with stress, caffeine and posture, so clinicians rely on repeated measurements rather than one reading. Persistently raised readings are assessed by a professional, who considers overall cardiovascular risk.",
  },
  {
    id: "fever",
    title: "Fever in adults",
    source: "Trusted medical reference — general symptoms",
    keywords: ["fever", "temperature", "chills", "pyrexia"],
    text: "Fever is a common response to infection. General supportive measures include rest and fluids. Medical review is advised for a fever that is very high, lasts more than a few days, occurs with a stiff neck, rash, confusion, breathing difficulty, or in people who are pregnant, very young, elderly or immunosuppressed.",
  },
  {
    id: "headache",
    title: "Headache red flags",
    source: "Trusted medical reference — neurology basics",
    keywords: ["headache", "migraine", "head pain"],
    text: "Most headaches are benign, such as tension-type or migraine. Warning features that need prompt professional assessment include a sudden severe 'worst ever' headache, headache with fever and neck stiffness, new weakness, vision loss, confusion, seizure, or headache after a head injury.",
  },
  {
    id: "cbc",
    title: "Complete blood count (CBC)",
    source: "Trusted medical reference — laboratory basics",
    keywords: ["cbc", "complete blood count", "haemoglobin", "hemoglobin", "wbc", "platelets"],
    text: "A complete blood count measures red cells, white cells and platelets. Haemoglobin relates to oxygen-carrying capacity, white cells to immune activity, and platelets to clotting. Reference ranges differ between laboratories, so results should be read against the range printed on the report and interpreted by a clinician.",
  },
  {
    id: "cholesterol",
    title: "Cholesterol and lipid panel",
    source: "Trusted medical reference — lipid basics",
    keywords: ["cholesterol", "ldl", "hdl", "triglycerides", "lipid"],
    text: "A lipid panel typically reports total cholesterol, LDL, HDL and triglycerides. LDL is often described as the cholesterol that contributes to arterial plaque, while HDL helps remove cholesterol. Results are interpreted together with age, blood pressure, smoking status, diabetes and family history when estimating cardiovascular risk.",
  },
  {
    id: "hydration",
    title: "Dehydration and fluid balance",
    source: "Trusted medical reference — general health",
    keywords: ["dehydration", "fluids", "thirst", "diarrhea", "diarrhoea", "vomiting"],
    text: "Dehydration can follow vomiting, diarrhoea, fever or hot weather. Signs include thirst, dark urine, reduced urination, dizziness and tiredness. Oral rehydration is the usual first step. Urgent assessment is appropriate for persistent vomiting, no urine output, confusion, or dehydration in infants and older adults.",
  },
  {
    id: "medication-safety",
    title: "Medication safety principles",
    source: "Trusted medical reference — medication safety",
    keywords: ["medicine", "medication", "dose", "prescription", "antibiotic", "side effect"],
    text: "Medication decisions — starting, stopping, changing a dose or switching a drug — belong to the prescribing clinician or pharmacist, who can check interactions, allergies, kidney and liver function and pregnancy status. Courses such as antibiotics should be taken as prescribed. Suspected side effects should be reported to a professional rather than managed by self-adjustment.",
  },
];

/** Keyword retrieval over the curated notes. Deterministic, no model call. */
export function searchTrustedNotes(query: string, limit = 3): TrustedNote[] {
  const q = (query ?? "").toLowerCase();
  if (!q.trim()) return [];
  const scored = TRUSTED_NOTES.map((note) => {
    let score = 0;
    for (const kw of note.keywords) if (q.includes(kw)) score += kw.length;
    if (q.includes(note.title.toLowerCase())) score += 5;
    return { note, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.note);
}

/** Formats notes as prompt context. */
export function formatTrustedNotes(notes: TrustedNote[]): string {
  if (!notes.length) return "";
  return `\n\nTrusted medical reference material:\n${notes
    .map((n) => `- ${n.title}: ${n.text}`)
    .join("\n")}`;
}
