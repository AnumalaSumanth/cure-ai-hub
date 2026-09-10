import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AgentMessage,
  AgentResponse,
  AgentTool,
  PendingAction,
  ToolContext,
  ToolResult,
} from "./types";
import { classifyIntent, toolForIntent } from "./router";
import { assessSafety, AGENT_DISCLAIMER, MEDIUM_RISK_GUIDANCE } from "./safety";
import { buildMemory } from "./memory";
import { describeAction, isConfirmed, isConsequential } from "./permissions";
import { verifyToolResult, type Confidence } from "./verifier";
import { AuditTrail } from "./audit";
import { symptomTool } from "./tools/symptom-tool";
import { medicalKnowledgeTool } from "./tools/medical-knowledge-tool";
import { reportTool } from "./tools/report-tool";
import { reminderTool } from "./tools/reminder-tool";
import { appointmentTool } from "./tools/appointment-tool";

const TOOLS: Record<string, AgentTool> = {
  [symptomTool.name]: symptomTool,
  [medicalKnowledgeTool.name]: medicalKnowledgeTool,
  [reportTool.name]: reportTool,
  [reminderTool.name]: reminderTool,
  [appointmentTool.name]: appointmentTool,
};

/** Deterministic argument extraction — model output is never trusted directly. */
export function buildArgs(tool: string, message: string, history: AgentMessage[]): unknown {
  const recentUser = [...history.filter((m) => m.role === "user").map((m) => m.content), message]
    .slice(-3)
    .join(" ");
  switch (tool) {
    case "symptom_guidance":
      return { symptoms: recentUser.slice(0, 2000) };
    case "search_medical_knowledge":
      return { query: message.slice(0, 1000) };
    case "analyze_health_report":
      return { query: message.slice(0, 1000) };
    case "create_medicine_reminder": {
      const time = message.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i)?.[0] ?? message.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0];
      const name =
        message.match(/\btake\s+(?:my\s+)?([a-z][a-z0-9-]{2,40})\b/i)?.[1] ??
        message.match(/\bremind me (?:about|for)\s+([a-z][a-z0-9-]{2,40})\b/i)?.[1];
      const generic = /^(medicine|medication|medicines|tablet|tablets|pill|pills|meds|dose)$/i;
      return {
        medicine_name: name && !generic.test(name) ? name : undefined,
        reminder_time: time,
      };
    }
    case "appointment_assistance": {
      const create = /\b(book|schedule|add|create|save)\b/i.test(message);
      return {
        action: create ? "create" : "list",
        doctor_name: message.match(/\b(?:dr\.?|doctor)\s+([a-z][a-z .'-]{1,40})/i)?.[1]?.trim(),
        appointment_date: message.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/)?.[0],
        appointment_time: message.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i)?.[0],
      };
    }
    default:
      return {};
  }
}

function toStringArgs(args: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((args ?? {}) as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

async function generalReply(message: string, history: AgentMessage[]): Promise<string> {
  const convo = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Cure AI"}: ${m.content}`)
    .join("\n");
  const text = await withAiFallback(async (model) => {
    const res = await generateText({
      model,
      prompt: `${MEDICAL_SAFETY_SYSTEM}\n\nConversation:\n${convo}\n\nUser: ${message}\n\nReply helpfully and briefly in markdown.`,
      maxOutputTokens: 700,
    });
    return res.text.trim();
  });
  return text;
}

export type AgentInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  message: string;
  history: AgentMessage[];
  /** Confirmation for a previously proposed consequential action. */
  confirm?: { tool: string; confirmed: boolean; args?: Record<string, string> };
};

export async function runAgent(input: AgentInput): Promise<AgentResponse> {
  const audit = new AuditTrail();
  const message = input.message.trim();
  audit.log("Understanding your request...");

  const base = (over: Partial<AgentResponse>): AgentResponse => ({
    intent: "GENERAL_HEALTH",
    tool: null,
    safety: "ok",
    risk: "low",
    confidence: "moderate" as Confidence,
    message: "",
    needsClarification: false,
    sources: [],
    steps: audit.steps,
    activity: audit.activity,
    pendingAction: null,
    disclaimer: AGENT_DISCLAIMER,
    ...over,
    // steps/activity must always reflect the final trail
    ...(over.steps ? {} : { steps: audit.steps }),
    ...(over.activity ? {} : { activity: audit.activity }),
  });

  // 1. Intent
  const intent = classifyIntent(message);
  audit.log("Intent identified", intent);

  // 2. Safety — always before any tool execution.
  const safety = assessSafety(message);
  audit.log("Safety check completed", `Risk: ${safety.risk} — ${safety.reason}`);

  if (safety.level === "urgent") {
    return base({
      intent,
      safety: "urgent",
      risk: "high",
      confidence: "high",
      message: safety.message!,
      steps: audit.steps,
      activity: audit.activity,
    });
  }

  // High risk but not an emergency: medication prescribing/changing — refuse the action.
  if (safety.risk === "high" && safety.message) {
    audit.log("Action blocked by safety policy", "No prescribing or medication changes");
    return base({
      intent,
      risk: "high",
      confidence: "high",
      message: safety.message,
      steps: audit.steps,
      activity: audit.activity,
    });
  }

  if (intent === "UNSUPPORTED") {
    return base({
      intent,
      risk: safety.risk,
      confidence: "high",
      message:
        "I'm the Cure AI Health Agent, so I can only help with health, medicines, appointments, your medical documents and medical study topics. What would you like help with?",
      needsClarification: true,
      steps: audit.steps,
      activity: audit.activity,
    });
  }

  // 3. Tool selection — exactly one tool, or none.
  const toolName = toolForIntent(intent);
  const tool = toolName ? TOOLS[toolName] : undefined;
  const memory = buildMemory(input.history, message);
  const ctx: ToolContext = {
    supabase: input.supabase,
    userId: input.userId,
    message,
    history: input.history,
    memory,
  };

  if (!tool) {
    try {
      audit.log("Preparing your response...");
      return base({
        intent,
        risk: safety.risk,
        confidence: "low",
        message: await generalReply(message, input.history),
        steps: audit.steps,
        activity: audit.activity,
      });
    } catch (err) {
      console.error("[agent] general reply failed", (err as Error)?.message);
      return base({
        intent,
        risk: safety.risk,
        confidence: "low",
        message: "I couldn't access that information right now. Please try again.",
        steps: audit.steps,
        activity: audit.activity,
      });
    }
  }

  audit.log("Checking relevant information...", tool.name);

  // 4. Validate arguments before execution — never trust generated params.
  const rawArgs = input.confirm?.args ?? buildArgs(tool.name, message, input.history);
  const parsed = tool.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return base({
      intent,
      tool: tool.name,
      risk: safety.risk,
      confidence: "low",
      message:
        "I need a little more detail before I can help with that. Could you rephrase with the key specifics?",
      needsClarification: true,
      steps: audit.steps,
      activity: audit.activity,
    });
  }

  // 4b. Permission gate — consequential writes need explicit confirmation.
  if (isConsequential(tool.name, parsed.data) && !isConfirmed(tool.name, input.confirm)) {
    const stringArgs = toStringArgs(parsed.data);
    const enoughDetail =
      tool.name === "create_medicine_reminder"
        ? Boolean(stringArgs["medicine_name"] && stringArgs["reminder_time"])
        : Boolean(stringArgs["doctor_name"] && stringArgs["appointment_date"]);

    if (enoughDetail) {
      const summary = describeAction(tool.name, parsed.data);
      audit.log("Confirmation requested before acting", tool.name);
      const pendingAction: PendingAction = { tool: tool.name, summary, args: stringArgs };
      return base({
        intent,
        tool: tool.name,
        risk: safety.risk,
        confidence: "high",
        message: `${summary}\n\nWould you like me to go ahead?`,
        needsClarification: true,
        pendingAction,
        steps: audit.steps,
        activity: audit.activity,
      });
    }
  }

  // 5. Execute, 6. verify, retry once on an invalid result.
  let result: ToolResult | null = null;
  let verification = verifyToolResult(null, safety.risk);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await tool.execute(parsed.data as never, ctx);
    } catch (err) {
      console.error(`[agent] tool ${tool.name} failed:`, (err as Error)?.message);
      result = null;
    }
    if (result?.needsClarification && (result.content ?? "").trim()) {
      verification = { valid: true, confidence: "high" };
      break;
    }
    verification = verifyToolResult(result, safety.risk);
    audit.log(
      attempt === 0 ? "Verifying the result..." : "Retrying after a failed verification...",
      verification.valid ? "Result verified" : `Invalid: ${verification.reason}`,
    );
    if (verification.valid) break;
  }

  if (!verification.valid || !result) {
    audit.log("Falling back to a safe response");
    return base({
      intent,
      tool: tool.name,
      risk: safety.risk,
      confidence: "low",
      message:
        (result?.content ?? "").trim() ||
        "I couldn't verify a reliable answer for that right now. Please try again, or ask a healthcare professional if it's important.",
      steps: audit.steps,
      activity: audit.activity,
    });
  }

  audit.log("Response generated");

  let content = result.content.trim();
  if (safety.risk === "medium" && !result.needsClarification) {
    content = `${content}\n\n> ${MEDIUM_RISK_GUIDANCE}`;
  }

  return base({
    intent,
    tool: tool.name,
    risk: safety.risk,
    confidence: verification.confidence,
    message: content,
    needsClarification: Boolean(result.needsClarification),
    sources: result.sources ?? [],
    steps: audit.steps,
    activity: audit.activity,
  });
}

export const AgentInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(20)
    .default([]),
  confirm: z
    .object({
      tool: z.string().max(80),
      confirmed: z.boolean(),
      args: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
