import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { z } from "zod";
import type { RiskLevel } from "./safety";
import type { Confidence } from "./verifier";
import type { ConversationMemory } from "./memory";

export type AgentIntent =
  | "SYMPTOM_GUIDANCE"
  | "MEDICAL_KNOWLEDGE"
  | "REPORT_ANALYSIS"
  | "MEDICINE_REMINDER"
  | "APPOINTMENT"
  | "GENERAL_HEALTH"
  | "UNSUPPORTED";

export type AgentMessage = { role: "user" | "assistant"; content: string };

/** Everything a tool is allowed to touch. Always scoped to the signed-in user. */
export type ToolContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  message: string;
  history: AgentMessage[];
  memory?: ConversationMemory;
};

export type ToolResult = {
  ok: boolean;
  /** Text the response generator may use / show. */
  content: string;
  /** True when the agent still needs information from the user. */
  needsClarification?: boolean;
  /** Non-sensitive citations or source labels. */
  sources?: string[];
  /** Small, non-sensitive payload for the UI (e.g. created reminder). */
  data?: Record<string, unknown>;
};

export type AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: S;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
};

export type AgentStep = { label: string };

/** One entry in the user-visible Agent Activity log. */
export type AgentActivityEntry = { at: string; label: string; detail?: string };

/** A consequential write the agent is asking permission to perform. */
export type PendingAction = {
  tool: string;
  summary: string;
  args: Record<string, string>;
};

export type AgentResponse = {
  intent: AgentIntent;
  tool: string | null;
  safety: "ok" | "urgent";
  risk: RiskLevel;
  confidence: Confidence;
  message: string;
  needsClarification: boolean;
  sources: string[];
  steps: string[];
  activity: AgentActivityEntry[];
  pendingAction: PendingAction | null;
  disclaimer: string;
};
