import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { z } from "zod";

export type AgentIntent =
  | "SYMPTOM_GUIDANCE"
  | "MEDICAL_KNOWLEDGE"
  | "REPORT_ANALYSIS"
  | "MEDICINE_REMINDER"
  | "APPOINTMENT"
  | "STUDY"
  | "MEDICAL_LIBRARY"
  | "GENERAL_HEALTH"
  | "UNSUPPORTED";

export type AgentMessage = { role: "user" | "assistant"; content: string };

/** Everything a tool is allowed to touch. Always scoped to the signed-in user. */
export type ToolContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  message: string;
  history: AgentMessage[];
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

export type AgentResponse = {
  intent: AgentIntent;
  tool: string | null;
  safety: "ok" | "urgent";
  message: string;
  needsClarification: boolean;
  sources: string[];
  steps: string[];
  disclaimer: string;
};
