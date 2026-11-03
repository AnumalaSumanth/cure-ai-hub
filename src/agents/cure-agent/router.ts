import type { AgentIntent } from "./types";

/**
 * Deterministic intent router. Pure function, no AI call, no side effects.
 * Keeps the agent cheap and predictable; the orchestrator only falls back to
 * the model for the final response, never for routing basics.
 */

const RULES: { intent: AgentIntent; patterns: RegExp[] }[] = [
  {
    intent: "REPORT_ANALYSIS",
    patterns: [
      /\b(analy[sz]e|read|interpret|explain)\b[^.?!]{0,40}\b(report|result|lab|blood work|bloodwork|scan|x-?ray|mri|ct)\b/i,
      /\b(blood|lab|health|medical)\s+report\b/i,
      /\bmy (uploaded|latest) (report|results?)\b/i,
    ],
  },
  {
    intent: "MEDICINE_REMINDER",
    patterns: [
      /\bremind( me)?\b[^.?!]{0,60}\b(medicine|medication|tablet|pill|dose|drug)\b/i,
      /\b(medicine|medication|tablet|pill|dose)\b[^.?!]{0,40}\breminder\b/i,
      /\bset (a )?reminder\b/i,
    ],
  },
  {
    intent: "HEALTH_INSIGHTS",
    patterns: [
      /\bhealth insights?\b/i,
      /\b(analy[sz]e|review|summar(y|ize|ise)|overview)\b[^.?!]{0,40}\bhealth\b/i,
      /\binsights?\b[^.?!]{0,20}\b(health|medication)\b/i,
      /\bhow (have|has) my health\b/i,
    ],
  },
  {
    intent: "APPOINTMENT",
    patterns: [
      /\bappointments?\b/i,
      /\b(book|schedule|cancel|reschedule)\b[^.?!]{0,30}\b(doctor|visit|consultation)\b/i,
    ],
  },
  {
    intent: "SYMPTOM_GUIDANCE",
    patterns: [
      /\bi (have|had|am having|'ve had|feel|am feeling|felt)\b/i,
      /\bmy \w+ (hurts?|aches?|is sore|is swollen|is painful)\b/i,
      /\b(headache|fever|cough|nausea|vomiting|diarrhea|rash|dizziness|fatigue|sore throat|stomach ache|back pain|chest pain|pain)\b/i,
      /\bsymptoms?\b/i,
    ],
  },
  {
    intent: "MEDICAL_KNOWLEDGE",
    patterns: [
      /^(what|who|when|which|how|why)\b[^?]*\?*$/i,
      /\b(explain|define|meaning of|tell me about|what is|what are)\b/i,
    ],
  },
];

const UNSUPPORTED = [
  /\b(write|generate)\b[^.?!]{0,30}\b(code|poem|essay|song)\b/i,
  /\b(stock|crypto|bitcoin|weather|football|movie)\b/i,
];

export function classifyIntent(message: string): AgentIntent {
  const text = (message ?? "").trim();
  if (!text) return "UNSUPPORTED";
  if (UNSUPPORTED.some((p) => p.test(text))) return "UNSUPPORTED";

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return "GENERAL_HEALTH";
}

/** Maps an intent to the single tool the agent is allowed to run for it. */
export function toolForIntent(intent: AgentIntent): string | null {
  switch (intent) {
    case "SYMPTOM_GUIDANCE":
      return "symptom_guidance";
    case "MEDICAL_KNOWLEDGE":
    case "GENERAL_HEALTH":
      return "search_medical_knowledge";
    case "REPORT_ANALYSIS":
      return "analyze_health_report";
    case "HEALTH_INSIGHTS":
      return "analyze_health_information";
    case "MEDICINE_REMINDER":
      return "create_medicine_reminder";
    case "APPOINTMENT":
      return "appointment_assistance";
    default:
      return null;
  }
}
