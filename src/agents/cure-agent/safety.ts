/**
 * Safety layer. Pure, deterministic, runs before any health tool executes.
 * It never diagnoses and never fabricates emergency contact numbers.
 */

const URGENT_PATTERNS: RegExp[] = [
  /\b(can'?t|cannot|unable to|difficulty|trouble|struggling to)\s+breath\w*/i,
  /\b(severe|crushing|worst)\b[^.?!]{0,30}\bchest (pain|pressure|tightness)\b/i,
  /\bchest pain\b[^.?!]{0,40}\b(arm|jaw|sweating|short(ness)? of breath)\b/i,
  /\b(unconscious|passed out|fainted|unresponsive|not waking up|loss of consciousness)\b/i,
  /\b(uncontrolled|heavy|won'?t stop|profuse)\b[^.?!]{0,20}\bbleed\w*/i,
  /\bbleeding\b[^.?!]{0,20}\b(won'?t stop|heavily|uncontrollably)\b/i,
  /\b(stroke|face droop\w*|slurred speech|sudden numbness|paraly[sz]ed|seizure|convulsion)\b/i,
  /\b(overdose|poison\w*|swallowed .*(bleach|pills|chemical))\b/i,
  /\b(suicid\w*|kill myself|end my life|self[- ]harm)\b/i,
  /\b(anaphyla\w*|throat closing|swollen tongue|severe allergic reaction)\b/i,
  /\b(blue lips|gasping for air|coughing up blood|vomiting blood)\b/i,
];

export type SafetyAssessment = {
  level: "ok" | "urgent";
  message?: string;
};

export const URGENT_MESSAGE =
  "What you're describing may need urgent medical attention. Please contact your local emergency services or get to the nearest emergency department right away — don't wait for an online assessment.\n\n" +
  "If someone is with you, ask them to help you get there. I can't diagnose this, and I'd rather you be checked by a professional now.";

export function assessSafety(message: string): SafetyAssessment {
  const text = (message ?? "").trim();
  if (!text) return { level: "ok" };
  if (URGENT_PATTERNS.some((p) => p.test(text))) {
    return { level: "urgent", message: URGENT_MESSAGE };
  }
  return { level: "ok" };
}

export const AGENT_DISCLAIMER =
  "Educational information only — not a medical diagnosis. Please consult a qualified healthcare professional.";
