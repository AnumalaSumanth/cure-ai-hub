import { describe, expect, it } from "vitest";
import { appointmentStatus, isUpcomingAppointment } from "../appointment-status";

describe("appointmentStatus", () => {
  it("marks a past appointment completed even when stored status is still upcoming", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const date = past.toISOString().slice(0, 10);
    const time = past.toISOString().slice(11, 16);
    expect(appointmentStatus({ status: "upcoming", appointment_date: date, appointment_time: time })).toBe("completed");
  });

  it("marks a future appointment upcoming", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const date = future.toISOString().slice(0, 10);
    const time = future.toISOString().slice(11, 16);
    expect(appointmentStatus({ status: "upcoming", appointment_date: date, appointment_time: time })).toBe("upcoming");
    expect(isUpcomingAppointment({ status: "upcoming", appointment_date: date, appointment_time: time })).toBe(true);
  });

  it("treats an appointment earlier today with no time as upcoming (end of day)", () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(appointmentStatus({ status: "upcoming", appointment_date: date, appointment_time: null })).toBe("upcoming");
  });

  it("keeps cancelled appointments cancelled regardless of date", () => {
    expect(appointmentStatus({ status: "cancelled", appointment_date: "2099-01-01", appointment_time: "09:00" })).toBe("cancelled");
  });

  it("falls back to upcoming when the date cannot be parsed", () => {
    expect(appointmentStatus({ status: "upcoming", appointment_date: "not-a-date", appointment_time: "09:00" })).toBe("upcoming");
  });
});
