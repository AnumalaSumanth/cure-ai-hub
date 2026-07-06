import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

/**
 * Shared server-side AI providers for Cure AI features
 * (Health Tips AI, Study AI, Health Assistant).
 *
 * Never import from client code. Handlers only.
 */

function getOpenAiModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const provider = createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return provider("gpt-4o-mini");
}

function getLovableModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const gateway = createLovableAiGatewayProvider(key);
  return gateway("google/gemini-3-flash-preview");
}

/**
 * Primary chat model (OpenAI if configured, else Lovable AI Gemini).
 * Backwards compatible with existing callers.
 */
export function getChatModel() {
  const m = getOpenAiModel() ?? getLovableModel();
  if (!m) {
    throw new Error(
      "No AI provider configured. Set OPENAI_API_KEY or LOVABLE_API_KEY.",
    );
  }
  return m;
}

/**
 * Try OpenAI first; on failure fall back once to the Lovable AI Gemini model.
 * `run` receives a ready-to-use model. Errors from OpenAI are logged server-side.
 */
export async function withAiFallback<T>(
  run: (model: ReturnType<typeof getChatModel>) => Promise<T>,
): Promise<T> {
  const openai = getOpenAiModel();
  const lovable = getLovableModel();
  if (openai) {
    try {
      return await run(openai);
    } catch (err) {
      console.error("[ai-provider] OpenAI call failed, trying Lovable AI fallback:", (err as Error)?.message);
      if (!lovable) throw err;
    }
  }
  if (!lovable) {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or LOVABLE_API_KEY.");
  }
  return await run(lovable);
}

/**
 * Medical / safety system prompt reused across educational AI features.
 */
export const MEDICAL_SAFETY_SYSTEM = `You are Cure AI, an educational healthcare assistant for medical students and general users.
Rules:
- Provide clear, safe, evidence-based educational information only.
- Do NOT diagnose. Do NOT prescribe medicines or dosages.
- For urgent or red-flag symptoms (chest pain, stroke signs, severe bleeding, breathing difficulty, suicidal thoughts, severe allergic reactions, etc.) tell the user to seek urgent professional medical care or local emergency services immediately.
- Always remind the user that this is educational information, not a medical diagnosis, and that they should consult a qualified healthcare professional.
- Keep responses concise and structured.`;
