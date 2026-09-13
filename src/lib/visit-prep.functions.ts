import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VisitPrep } from "./visit-prep.server";

export const prepareDoctorVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ appointmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<VisitPrep> => {
    const { buildVisitPrep } = await import("./visit-prep.server");
    return await buildVisitPrep(context.supabase, context.userId, data.appointmentId);
  });
