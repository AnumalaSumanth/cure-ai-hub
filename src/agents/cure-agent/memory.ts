import type { AgentMessage } from "./types";

/**
 * Lightweight, in-request conversation memory. Pure functions only — nothing
 * is persisted, so no new consent surface or schema is required. The user's
 * own database records remain the single source of truth.
 */

export type ConversationMemory = {
  /** Recent user turns, oldest first. */
  recentUserTurns: string[];
  /** Medicine-like names the user mentioned in this conversation. */
  mentionedMedicines: string[];
  /** Whether the user already referred to an appointment. */
  mentionedAppointment: boolean;
  /** Whether the user already referred to a report/document. */
  mentionedReport: boolean;
};

const STOP = new Set([
  "medicine",
  "medication",
  "medicines",
  "tablet",
  "tablets",
  "pill",
  "pills",
  "meds",
  "dose",
  "doctor",
]);

export function buildMemory(history: AgentMessage[], message: string): ConversationMemory {
  const userTurns = [...history.filter((m) => m.role === "user").map((m) => m.content), message]
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(-5);
  const joined = userTurns.join(" \n ");

  const meds = new Set<string>();
  for (const m of joined.matchAll(/\btake\s+(?:my\s+)?([A-Za-z][A-Za-z0-9-]{2,40})\b/g)) {
    const name = m[1]!.toLowerCase();
    if (!STOP.has(name)) meds.add(m[1]!);
  }

  return {
    recentUserTurns: userTurns,
    mentionedMedicines: [...meds],
    mentionedAppointment: /\bappointments?\b|\bdoctor'?s? visit\b/i.test(joined),
    mentionedReport: /\breports?\b|\bresults?\b|\bblood ?work\b|\bscan\b/i.test(joined),
  };
}

/** Compact text summary the tools can prepend to a prompt. */
export function memoryContext(memory: ConversationMemory): string {
  const bits: string[] = [];
  if (memory.mentionedMedicines.length) {
    bits.push(`Medicines mentioned: ${memory.mentionedMedicines.join(", ")}`);
  }
  if (memory.mentionedAppointment) bits.push("User referenced an appointment.");
  if (memory.mentionedReport) bits.push("User referenced a medical report.");
  return bits.length ? `Conversation context:\n${bits.join("\n")}` : "";
}
