import { describe, expect, it } from "vitest";
import { classifyIntent, toolForIntent } from "../router";
import { assessSafety } from "../safety";
import { parseTime } from "../tools/reminder-tool";
import { reportTool } from "../tools/report-tool";

describe("intent router", () => {
  it("routes symptoms", () => {
    expect(classifyIntent("I have a headache.")).toBe("SYMPTOM_GUIDANCE");
  });
  it("routes knowledge questions", () => {
    expect(classifyIntent("Explain diabetes.")).toBe("MEDICAL_KNOWLEDGE");
  });
  it("routes report analysis", () => {
    expect(classifyIntent("Analyze my uploaded blood report.")).toBe("REPORT_ANALYSIS");
  });
  it("routes medicine reminders", () => {
    expect(classifyIntent("Remind me to take my medicine at 9 PM.")).toBe("MEDICINE_REMINDER");
  });
  it("routes study requests", () => {
    expect(classifyIntent("Create a study plan for anatomy.")).toBe("STUDY");
  });
  it("maps intents to a single tool", () => {
    expect(toolForIntent("STUDY")).toBe("study_assistant");
    expect(toolForIntent("UNSUPPORTED")).toBeNull();
  });
});

describe("safety layer", () => {
  it("flags potential emergencies and blocks tool execution", () => {
    const a = assessSafety("I have severe chest pain and can't breathe");
    expect(a.level).toBe("urgent");
    expect(a.message).toMatch(/emergency/i);
  });
  it("does not flag ordinary symptoms", () => {
    expect(assessSafety("I have a mild headache").level).toBe("ok");
  });
});

describe("reminder time parsing", () => {
  it("parses 12h and 24h times", () => {
    expect(parseTime("9 PM")).toBe("21:00");
    expect(parseTime("07:30")).toBe("07:30");
    expect(parseTime("tomorrow")).toBeNull();
  });
});

describe("data isolation", () => {
  it("denies access to a report belonging to another user", async () => {
    const OTHER = "11111111-1111-1111-1111-111111111111";
    let filteredUser: string | null = null;
    const builder: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "user_id") filteredUser = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    } as unknown as Record<string, unknown> & PromiseLike<{ data: unknown[]; error: null }>;
    Object.assign(builder, chain);

    const res = await reportTool.execute(
      { document_id: "22222222-2222-2222-2222-222222222222" },
      {
        supabase: { from: () => chain } as never,
        userId: OTHER,
        message: "show me that report",
        history: [],
      },
    );

    expect(filteredUser).toBe(OTHER);
    expect(res.content).toMatch(/isn't yours to access|couldn't find/i);
  });
});
