/**
 * Safety layer. Pure, deterministic, runs before any health tool executes.
 * It never diagnoses and never fabricates emergency contact numbers.
 *
 * Risk levels:
 *  low    — general health information            → answer normally
 *  medium — symptom guidance / personal health     → answer + safety guidance + sources
 *  high   — emergency or medication-change request → refuse the action, escalate to care
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

/** Requests that would mean prescribing, dosing or altering medication. */
const MEDICATION_CHANGE_PATTERNS: RegExp[] = [
  /\b(prescribe|prescription for)\b/i,
  /\bwhat (dose|dosage)\b|\bhow (much|many)\b[^.?!]{0,30}\b(mg|ml|tablets?|pills?|dose)\b/i,
  /\b(double|triple|increase|decrease|reduce|lower|raise)\b[^.?!]{0,25}\b(dose|dosage|medication|medicine)\b/i,
  /\b(stop|quit|skip|discontinue)\b[^.?!]{0,25}\b(my |the )?(medication|medicine|tablets?|pills?|antibiotics?|insulin)\b/i,
  /\b(can|should) i take\b[^.?!]{0,40}\b(instead of|with)\b[^.?!]{0,30}\b(medication|medicine|antibiotics?|insulin)\b/i,
  /\bantibiotics? (for|without)\b/i,
];

/** Anything touching the user's own body/health rather than abstract knowledge. */
const PERSONAL_HEALTH_PATTERNS: RegExp[] = [
  /\bi (have|had|am having|'ve had|feel|am feeling|felt|get)\b/i,
  /\bmy \w+ (hurts?|aches?|is sore|is swollen|is painful)\b/i,
  /\b(symptoms?|my (report|results?|blood work|bloodwork))\b/i,
];

export type RiskLevel = "low" | "medium" | "high";

export type SafetyAssessment = {
  level: "ok" | "urgent";
  risk: RiskLevel;
  /** Why the risk level was chosen — surfaced in the activity log. */
  reason: string;
  message?: string;
};

export const URGENT_MESSAGE =
  "What you're describing may need urgent medical attention. Please contact your local emergency services or get to the nearest emergency department right away — don't wait for an online assessment.\n\n" +
  "If someone is with you, ask them to help you get there. I can't diagnose this, and I'd rather you be checked by a professional now.";

export const MEDICATION_REFUSAL_MESSAGE =
  "I can't prescribe medication, recommend a dose, or tell you to start, stop or change a medicine — that decision has to come from the prescriber who knows your full history.\n\n" +
  "What I can do: explain what a medicine is generally used for, help you prepare questions for your doctor or pharmacist, and set a reminder for medication you've already been prescribed.\n\n" +
  "If this feels urgent, please contact your doctor, a pharmacist, or your local emergency services.";

export function assessSafety(message: string): SafetyAssessment {
  const text = (message ?? "").trim();
  if (!text) return { level: "ok", risk: "low", reason: "Empty message" };

  if (URGENT_PATTERNS.some((p) => p.test(text))) {
    return {
      level: "urgent",
      risk: "high",
      reason: "Possible emergency symptoms detected",
      message: URGENT_MESSAGE,
    };
  }

  if (MEDICATION_CHANGE_PATTERNS.some((p) => p.test(text))) {
    return {
      level: "ok",
      risk: "high",
      reason: "Request would require prescribing or changing medication",
      message: MEDICATION_REFUSAL_MESSAGE,
    };
  }

  if (PERSONAL_HEALTH_PATTERNS.some((p) => p.test(text))) {
    return { level: "ok", risk: "medium", reason: "Personal symptom or health-record guidance" };
  }

  return { level: "ok", risk: "low", reason: "General health information" };
}

export const AGENT_DISCLAIMER =
  "Educational information only — not a medical diagnosis. Please consult a qualified healthcare professional.";

/** Extra guidance appended to medium-risk answers. */
export const MEDIUM_RISK_GUIDANCE =
  "This is general guidance based on what you described. If symptoms worsen quickly, don't improve, or you feel very unwell, please contact a healthcare professional.";
