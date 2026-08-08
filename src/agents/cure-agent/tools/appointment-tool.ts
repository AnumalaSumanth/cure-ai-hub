import { z } from "zod";
import type { AgentTool } from "../types";

function parseDate(input: string): string | null {
  const t = input.trim();
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const dmy = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

/**
 * Appointment assistance. Lists the user's own upcoming appointments, or
 * creates one when the user supplies real details. Never fabricates doctors,
 * hospitals, availability or confirmations.
 */
export const appointmentTool: AgentTool = {
  name: "appointment_assistance",
  description: "List the user's upcoming appointments or create one from details they provide.",
  inputSchema: z.object({
    action: z.enum(["list", "create"]).default("list"),
    doctor_name: z.string().max(120).optional(),
    appointment_date: z.string().max(40).optional(),
    appointment_time: z.string().max(40).optional(),
    hospital_name: z.string().max(160).optional(),
    notes: z.string().max(500).optional(),
  }),
  async execute(args, ctx) {
    const a = args as {
      action?: "list" | "create";
      doctor_name?: string;
      appointment_date?: string;
      appointment_time?: string;
      hospital_name?: string;
      notes?: string;
    };

    if ((a.action ?? "list") === "create") {
      const doctor = a.doctor_name?.trim();
      const date = a.appointment_date ? parseDate(a.appointment_date) : null;
      if (!doctor || !date) {
        const missing = [!doctor ? "the doctor's name" : null, !date ? "the date (YYYY-MM-DD)" : null]
          .filter(Boolean)
          .join(" and ");
        return {
          ok: true,
          needsClarification: true,
          content: `I can add that appointment to your list — I just need ${missing}. I can only record details you give me; I can't book with a clinic or check availability.`,
        };
      }
      const { data, error } = await ctx.supabase
        .from("appointments")
        .insert({
          user_id: ctx.userId,
          doctor_name: doctor,
          appointment_date: date,
          appointment_time: a.appointment_time?.trim() || null,
          hospital_name: a.hospital_name?.trim() || null,
          notes: a.notes?.trim() || null,
        })
        .select("id, doctor_name, appointment_date, appointment_time")
        .single();
      if (error || !data) {
        console.error("[agent:appointment] insert failed", error?.message);
        return { ok: false, content: "I couldn't save that appointment right now. Please try again." };
      }
      return {
        ok: true,
        content: `Saved — **${data.doctor_name}** on **${data.appointment_date}**${
          data.appointment_time ? ` at ${data.appointment_time}` : ""
        } is now in your Appointments page. This is your own record, not a confirmed booking with the clinic.`,
        data: { id: data.id },
      };
    }

    const { data, error } = await ctx.supabase
      .from("appointments")
      .select("doctor_name, hospital_name, appointment_date, appointment_time, status")
      .eq("user_id", ctx.userId)
      .order("appointment_date", { ascending: true })
      .limit(5);
    if (error) {
      console.error("[agent:appointment] read failed", error.message);
      return { ok: false, content: "I couldn't load your appointments right now. Please try again." };
    }
    if (!data?.length) {
      return {
        ok: true,
        content:
          "You don't have any appointments saved yet. Tell me the doctor's name and date and I'll add one for you.",
      };
    }
    const list = data
      .map(
        (r) =>
          `- **${r.doctor_name}**${r.hospital_name ? ` (${r.hospital_name})` : ""} — ${r.appointment_date}${
            r.appointment_time ? ` at ${r.appointment_time}` : ""
          } · ${r.status}`,
      )
      .join("\n");
    return { ok: true, content: `Here are your upcoming appointments:\n\n${list}` };
  },
};
