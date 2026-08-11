/**
 * Permission layer. Consequential actions — anything that writes to the user's
 * records — require an explicit confirmation before the agent executes them.
 */

const CONSEQUENTIAL_TOOLS = new Set(["create_medicine_reminder", "appointment_assistance"]);

export function isConsequential(toolName: string, args: unknown): boolean {
  if (toolName === "create_medicine_reminder") return true;
  if (toolName === "appointment_assistance") {
    return (args as { action?: string } | null)?.action === "create";
  }
  return CONSEQUENTIAL_TOOLS.has(toolName) ? true : false;
}

/** Plain-language description of the pending write, shown in the confirm prompt. */
export function describeAction(toolName: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, string | undefined>;
  if (toolName === "create_medicine_reminder") {
    return `Create a reminder for **${a["medicine_name"] ?? "your medicine"}**${
      a["reminder_time"] ? ` at **${a["reminder_time"]}**` : ""
    } in your Medicines list.`;
  }
  if (toolName === "appointment_assistance") {
    return `Save an appointment with **${a["doctor_name"] ?? "your doctor"}**${
      a["appointment_date"] ? ` on **${a["appointment_date"]}**` : ""
    } to your Appointments list.`;
  }
  return "Perform this action on your records.";
}

/**
 * A consequential action is only allowed to run when the request carries a
 * matching confirmation for the same tool.
 */
export function isConfirmed(
  toolName: string,
  confirm: { tool: string; confirmed: boolean } | undefined,
): boolean {
  return Boolean(confirm && confirm.confirmed && confirm.tool === toolName);
}
