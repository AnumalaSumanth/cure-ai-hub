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
    });
  });
