import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled reminder processor. Called by pg_cron with the project apikey.
 * Sends email reminders for appointments whose reminder window has arrived.
 */
export const Route = createFileRoute("/api/public/hooks/appointment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ?? request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendGmail, isGmailConfigured } = await import("@/lib/gmail.server");

        const now = Date.now();
        const horizon = new Date(now + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const { data: rows, error } = await supabaseAdmin
          .from("appointments")
          .select(
            "id, user_id, doctor_name, hospital_name, appointment_date, appointment_time, reminder_method, reminder_offset",
          )
          .is("reminder_sent_at", null)
          .eq("reminder_method", "email")
          .lte("appointment_date", horizon)
          .limit(50);

        if (error) {
          console.error("[reminders] query failed", error.message);
          return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
        }

        let sent = 0;
        for (const a of rows ?? []) {
          const at = new Date(`${a.appointment_date}T${a.appointment_time ?? "09:00"}:00Z`).getTime();
          const lead = a.reminder_offset === "1_hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          if (now < at - lead || now > at) continue;

          let failure: string | null = null;
          try {
            if (!isGmailConfigured()) throw new Error("Gmail connector not configured");
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
            const email = userRes?.user?.email;
            if (!email) throw new Error("No email on account");

            const when = new Date(`${a.appointment_date}T${a.appointment_time ?? "09:00"}:00Z`);
            const pretty = when.toUTCString().replace(" GMT", "");
            await sendGmail({
              to: email,
              subject: `Reminder: appointment with ${a.doctor_name}`,
              text: `Reminder: You have an appointment with ${a.doctor_name}${
                a.hospital_name ? ` at ${a.hospital_name}` : ""
              } on ${pretty}.\n\n— Cure AI`,
            });
            sent += 1;
          } catch (e) {
            failure = e instanceof Error ? e.message : "Unknown error";
            console.error("[reminders] send failed", failure);
          }

          await supabaseAdmin
            .from("appointments")
            .update({ reminder_sent_at: new Date().toISOString(), reminder_error: failure })
            .eq("id", a.id);
        }

        return new Response(JSON.stringify({ ok: true, processed: rows?.length ?? 0, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
