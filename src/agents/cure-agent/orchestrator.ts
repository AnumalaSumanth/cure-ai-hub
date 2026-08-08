import { z } from "zod";
import { generateText } from "ai";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "@/lib/ai-provider.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AgentMessage, AgentResponse, AgentTool, ToolContext } from "./types";
import { classifyIntent, toolForIntent } from "./router";
import { assessSafety, AGENT_DISCLAIMER } from "./safety";
import { symptomTool } from "./tools/symptom-tool";
import { medicalKnowledgeTool } from "./tools/medical-knowledge-tool";
import { reportTool } from "./tools/report-tool";
import { reminderTool } from "./tools/reminder-tool";
import { appointmentTool } from "./tools/appointment-tool";
import { studyTool } from "./tools/study-tool";
import { libraryTool } from "./tools/library-tool";

const TOOLS: Record<string, AgentTool> = {
  [symptomTool.name]: symptomTool,
  [medicalKnowledgeTool.name]: medicalKnowledgeTool,
  [reportTool.name]: reportTool,
  [reminderTool.name]: reminderTool,
  [appointmentTool.name]: appointmentTool,
  [studyTool.name]: studyTool,
  [libraryTool.name]: libraryTool,
};

/** Deterministic argument extraction — model output is never trusted directly. */
function buildArgs(tool: string, message: string, history: AgentMessage[]): unknown {
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
    case "study_assistant":
      return {
        topic: message.slice(0, 500),
        wants_plan: /\b(plan|schedule|prepare|revision)\b/i.test(message),
      };
    case "search_medical_library": {
      const m = message.match(/\b(?:about|on|for|find|search)\s+([a-z0-9][\w .-]{2,60})/i)?.[1];
      return { query: m?.trim() };
    }
    default:
      return {};
  }
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

export async function runAgent(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  message: string;
  history: AgentMessage[];
}): Promise<AgentResponse> {
  const steps: string[] = ["Understanding your request..."];
  const message = input.message.trim();

  // 1. Intent
  const intent = classifyIntent(message);

  // 2. Safety — always before any tool execution.
  const safety = assessSafety(message);
  if (safety.level === "urgent") {
    return {
      intent,
      tool: null,
      safety: "urgent",
      message: safety.message!,
      needsClarification: false,
      sources: [],
      steps: [...steps, "Running a safety check..."],
      disclaimer: AGENT_DISCLAIMER,
    };
  }
  steps.push("Running a safety check...");

  if (intent === "UNSUPPORTED") {
    return {
      intent,
      tool: null,
      safety: "ok",
      message:
        "I'm the Cure AI Health Agent, so I can only help with health, medicines, appointments, your medical documents and medical study topics. What would you like help with?",
      needsClarification: true,
      sources: [],
      steps,
      disclaimer: AGENT_DISCLAIMER,
    };
  }

  // 3. Tool selection — exactly one tool, or none.
  const toolName = toolForIntent(intent);
  const tool = toolName ? TOOLS[toolName] : undefined;
  const ctx: ToolContext = {
    supabase: input.supabase,
    userId: input.userId,
    message,
    history: input.history,
  };

  if (!tool) {
    try {
      steps.push("Preparing your response...");
      return {
        intent,
        tool: null,
        safety: "ok",
        message: await generalReply(message, input.history),
        needsClarification: false,
        sources: [],
        steps,
        disclaimer: AGENT_DISCLAIMER,
      };
    } catch (err) {
      console.error("[agent] general reply failed", (err as Error)?.message);
      return {
        intent,
        tool: null,
        safety: "ok",
        message: "I couldn't access that information right now. Please try again.",
        needsClarification: false,
        sources: [],
        steps,
        disclaimer: AGENT_DISCLAIMER,
      };
    }
  }

  steps.push("Checking relevant information...");

  // 4. Validate arguments before execution — never trust generated params.
  const parsed = tool.inputSchema.safeParse(buildArgs(tool.name, message, input.history));
  if (!parsed.success) {
    return {
      intent,
      tool: tool.name,
      safety: "ok",
      message:
        "I need a little more detail before I can help with that. Could you rephrase with the key specifics?",
      needsClarification: true,
      sources: [],
      steps,
      disclaimer: AGENT_DISCLAIMER,
    };
  }

  // 5. Execute + 6. verify result
  try {
    const result = await tool.execute(parsed.data as never, ctx);
    steps.push("Preparing your response...");
    const content = (result.content ?? "").trim();
    if (!result.ok || !content) {
      return {
        intent,
        tool: tool.name,
        safety: "ok",
        message: content || "I couldn't access that information right now. Please try again.",
        needsClarification: false,
        sources: [],
        steps,
        disclaimer: AGENT_DISCLAIMER,
      };
    }
    return {
      intent,
      tool: tool.name,
      safety: "ok",
      message: content,
      needsClarification: Boolean(result.needsClarification),
      sources: result.sources ?? [],
      steps,
      disclaimer: AGENT_DISCLAIMER,
    };
  } catch (err) {
    console.error(`[agent] tool ${tool.name} failed:`, (err as Error)?.message);
    return {
      intent,
      tool: tool.name,
      safety: "ok",
      message: "I couldn't access that information right now. Please try again.",
      needsClarification: false,
      sources: [],
      steps,
      disclaimer: AGENT_DISCLAIMER,
    };
  }
}

export const AgentInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(20)
    .default([]),
});
