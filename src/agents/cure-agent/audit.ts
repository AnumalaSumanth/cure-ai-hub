import type { AgentActivityEntry } from "./types";

/**
 * Audit trail. Collects a human-readable, non-sensitive log of every step the
 * agent takes so users can see it is an agent, not a chatbot.
 * Never records raw medical content — only step labels.
 */
export class AuditTrail {
  private readonly entries: AgentActivityEntry[] = [];

  log(label: string, detail?: string): void {
    this.entries.push({
      at: new Date().toISOString(),
      label,
      ...(detail ? { detail } : {}),
    });
  }

  get steps(): string[] {
    return this.entries.map((e) => e.label);
  }

  get activity(): AgentActivityEntry[] {
    return [...this.entries];
  }
}
