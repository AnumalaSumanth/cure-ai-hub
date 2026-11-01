/**
 * Single source of truth for appointment status. The stored `status` column
 * can go stale (rows stay "upcoming" after their date passes), so status is
 * always derived from the appointment date/time.
 */
export type AppointmentStatus = "upcoming" | "completed" | "cancelled";

export function appointmentStatus(a: {
  status?: string | null;
  appointment_date: string;
  appointment_time: string | null;
}): AppointmentStatus {
  if (a.status === "cancelled") return "cancelled";
  // No time recorded: treat the whole day as still available.
  const at = new Date(`${a.appointment_date}T${a.appointment_time ?? "23:59"}`).getTime();
  if (Number.isNaN(at)) return "upcoming";
  return at < Date.now() ? "completed" : "upcoming";
}

export function isUpcomingAppointment(a: {
  status?: string | null;
  appointment_date: string;
  appointment_time: string | null;
}): boolean {
  return appointmentStatus(a) === "upcoming";
}

/** Sort key for chronological appointment ordering. */
export function appointmentSortKey(a: { appointment_date: string; appointment_time: string | null }): string {
  return `${a.appointment_date}T${a.appointment_time ?? "23:59"}`;
}
