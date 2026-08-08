import { z } from "zod";
import type { AgentTool } from "../types";

/** Time like "9 PM", "21:00", "9:30pm" -> "21:00" */
export function parseTime(input: string): string | null {
  const t = input.trim().toLowerCase();
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ?? "00";
    if (h === 12) h = 0;
    if (m[3] === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  return null;
}

/**
 * Creates a medicine reminder ONLY on an explicit user request. Never suggests
 * dosages and never changes existing medication.
 */
export const reminderTool: AgentTool = {
  name: "create_medicine_reminder",
  description: "Create a medicine reminder in the user's own Medicines list when explicitly asked.",
  inputSchema: z.object({
    medicine_name: z.string().min(1).max(120).optional(),
    reminder_time: z.string().max(40).optional(),
    dosage: z.string().max(60).optional(),
    frequency: z.string().max(60).optional(),
  }),
  async execute(args, ctx) {
    const a = args as {
      medicine_name?: string;
      reminder_time?: string;
      dosage?: string;
      frequency?: string;
    };
    const name = a.medicine_name?.trim();
    const time = a.reminder_time ? parseTime(a.reminder_time) : null;

    if (!name || !time) {
      const missing = [!name ? "the medicine name" : null, !time ? "the time" : null]
        .filter(Boolean)
        .join(" and ");
      return {
        ok: true,
        needsClarification: true,
        content: `I can set that reminder — I just need ${missing}. For example: "Remind me to take Metformin at 9 PM."`,
      };
    }

    const { data, error } = await ctx.supabase
      .from("medicines")
      .insert({
        user_id: ctx.userId,
        medicine_name: name,
        reminder_time: time,
        dosage: a.dosage?.trim() || null,
        frequency: a.frequency?.trim() || null,
      })
      .select("id, medicine_name, reminder_time")
      .single();

    if (error || !data) {
      console.error("[agent:reminder] insert failed", error?.message);
      return { ok: false, content: "I couldn't save that reminder right now. Please try again." };
    }

    return {
      ok: true,
      content: `Done — I added a reminder for **${data.medicine_name}** at **${data.reminder_time}** to your Medicines list. You can edit or remove it on the Medicines page.\n\nI can't advise on dosage changes — please follow your prescriber's instructions.`,
      data: { id: data.id },
    };
  },
};
