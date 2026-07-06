import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/**
 * Shared server-side AI provider used by every Cure AI feature
 * (Health Tips AI, Study AI, Health Assistant).
 *
 * Priority:
 *   1. OPENAI_API_KEY  -> OpenAI (cost-efficient `gpt-4o-mini`)
 *   2. LOVABLE_API_KEY -> Lovable AI Gateway (Gemini flash) fallback
 *
 * NEVER import this file from client code. Handlers only.
 */
export function getChatModel() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const provider = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${openaiKey}` },
    });
    return provider("gpt-4o-mini");
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error(
      "No AI provider configured. Set OPENAI_API_KEY or LOVABLE_API_KEY.",
    );
  }
  const gateway = createLovableAiGatewayProvider(lovableKey);
  return gateway("google/gemini-3-flash-preview");
}

/**
 * Medical / safety system prompt reused across educational AI features.
 * Keep short to reduce token cost.
 */
export const MEDICAL_SAFETY_SYSTEM = `You are Cure AI, an educational healthcare assistant for medical students and general users.
Rules:
- Provide clear, safe, evidence-based educational information only.
- Do NOT diagnose. Do NOT prescribe medicines or dosages.
- For urgent or red-flag symptoms (chest pain, stroke signs, severe bleeding, breathing difficulty, suicidal thoughts, severe allergic reactions, etc.) tell the user to seek urgent professional medical care or local emergency services immediately.
- Always remind the user that this is educational information, not a medical diagnosis, and that they should consult a qualified healthcare professional.
- Keep responses concise and structured.`;
