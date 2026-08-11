import type { RiskLevel } from "./safety";
import type { ToolResult } from "./types";

/**
 * Verifier. Runs after tool execution and before the response is returned.
 * Pure and deterministic — it checks that a result is usable and grades how
 * well-supported it is. Invalid results trigger a retry or fallback in the
 * orchestrator.
 */

export type Confidence = "low" | "moderate" | "high";

export type Verification = {
  valid: boolean;
  /** Short machine-readable reason when invalid. */
  reason?: string;
  confidence: Confidence;
};

const FABRICATION_PATTERNS: RegExp[] = [
  /\b(according to|as reported by)\s+(a|the)?\s*(\d{4}\s+)?(study|trial|paper|journal)\b/i,
  /\bdoi:\s*10\./i,
  /\bI have booked\b|\bI have cancelled\b|\bI called (your|the) (doctor|clinic)\b/i,
];

/** Answers this short are almost always a truncated or failed generation. */
const MIN_CONTENT_LENGTH = 12;

export function verifyToolResult(
  result: ToolResult | null | undefined,
  risk: RiskLevel,
): Verification {
  if (!result) return { valid: false, reason: "no_result", confidence: "low" };

  const content = (result.content ?? "").trim();
  if (!result.ok) return { valid: false, reason: "tool_error", confidence: "low" };
  if (content.length < MIN_CONTENT_LENGTH) {
    return { valid: false, reason: "empty_content", confidence: "low" };
  }
  if (FABRICATION_PATTERNS.some((p) => p.test(content))) {
    return { valid: false, reason: "possible_fabrication", confidence: "low" };
  }

  return { valid: true, confidence: gradeConfidence(result, risk) };
}

/**
 * Confidence communicates how well-supported an answer is — never a clinical
 * probability.
 */
export function gradeConfidence(result: ToolResult, risk: RiskLevel): Confidence {
  const sources = result.sources?.length ?? 0;
  if (result.data && sources === 0) return "high"; // came straight from the user's own records
  if (sources >= 2) return "high";
  if (sources === 1) return "moderate";
  return risk === "low" ? "moderate" : "low";
}

export function confidenceLabel(c: Confidence): string {
  return c === "high" ? "High" : c === "moderate" ? "Moderate" : "Low";
}
