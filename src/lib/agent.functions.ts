import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentResponse } from "@/agents/cure-agent/types";

const InputSchema = z.object({
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

export const askHealthAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AgentResponse> => {
    const { runAgent } = await import("@/agents/cure-agent/orchestrator");
    return await runAgent({
      supabase: context.supabase,
      userId: context.userId,
      message: data.message,
      history: data.history,
      ...(data.confirm ? { confirm: data.confirm } : {}),
    });
  });

/** Data behind the Agent Action Center — the user's own records only. */
export const getAgentActionCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const [meds, appts, docs] = await Promise.all([
      supabase
        .from("medicines")
        .select("id, medicine_name, reminder_time, dosage")
        .eq("user_id", userId)
        .order("reminder_time", { ascending: true })
        .limit(6),
      supabase
        .from("appointments")
        .select("id, doctor_name, hospital_name, appointment_date, appointment_time")
        .eq("user_id", userId)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .limit(5),
      supabase
        .from("medical_documents")
        .select("id, file_name, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    return {
      medicines: meds.data ?? [],
      appointments: appts.data ?? [],
      documents: docs.data ?? [],
    };
  });
