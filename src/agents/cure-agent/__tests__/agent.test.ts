import { describe, expect, it } from "vitest";
import { classifyIntent, toolForIntent } from "../router";
import { assessSafety, MEDICATION_REFUSAL_MESSAGE } from "../safety";
import { buildMemory, memoryContext } from "../memory";
import { describeAction, isConfirmed, isConsequential } from "../permissions";
import { gradeConfidence, verifyToolResult } from "../verifier";
import { AuditTrail } from "../audit";
import { searchTrustedNotes, formatTrustedNotes } from "../knowledge/trusted-sources";
import { parseTime } from "../tools/reminder-tool";
import { reportTool } from "../tools/report-tool";
import { libraryTool } from "../tools/library-tool";
import { appointmentTool } from "../tools/appointment-tool";
import { medicalKnowledgeTool } from "../tools/medical-knowledge-tool";
import type { ToolContext } from "../types";

/** Minimal chainable Supabase stub. */
function stubClient(rows: unknown[] = [], error: { message: string } | null = null) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    insert: () => chain,
    single: () => Promise.resolve({ data: rows[0] ?? null, error }),
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    },
    gte: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: { data: unknown[]; error: unknown }) => unknown) =>
      resolve({ data: rows, error }),
  });
  return { client: { from: () => chain } as never, filters };
}

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  const { client } = stubClient();
  return {
    supabase: client,
    userId: "00000000-0000-0000-0000-000000000001",
    message: "",
    history: [],
    ...over,
  } as ToolContext;
}

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
  it("routes appointments", () => {
    expect(classifyIntent("Show my appointments")).toBe("APPOINTMENT");
  });
  it("routes study requests", () => {
    expect(classifyIntent("Create a study plan for anatomy.")).toBe("STUDY");
  });
  it("routes medical library searches", () => {
    expect(classifyIntent("Search my documents for cholesterol")).toBe("MEDICAL_LIBRARY");
  });
  it("marks unrelated requests unsupported", () => {
    expect(classifyIntent("Write me a poem about bitcoin")).toBe("UNSUPPORTED");
    expect(toolForIntent("UNSUPPORTED")).toBeNull();
  });
  it("maps intents to a single tool", () => {
    expect(toolForIntent("STUDY")).toBe("study_assistant");
    expect(toolForIntent("MEDICAL_LIBRARY")).toBe("search_medical_library");
  });
});

describe("safety layer — risk levels", () => {
  it("flags potential emergencies as high risk and blocks tool execution", () => {
    const a = assessSafety("I have severe chest pain and can't breathe");
    expect(a.level).toBe("urgent");
    expect(a.risk).toBe("high");
    expect(a.message).toMatch(/emergency/i);
    expect(a.message).not.toMatch(/diagnos(is|ed) is/i);
  });
  it("treats ordinary symptoms as medium risk", () => {
    const a = assessSafety("I have a mild headache");
    expect(a.level).toBe("ok");
    expect(a.risk).toBe("medium");
  });
  it("treats general knowledge as low risk", () => {
    expect(assessSafety("What is HbA1c?").risk).toBe("low");
  });
  it("refuses prescribing and dose changes as high risk", () => {
    for (const q of [
      "Can you prescribe antibiotics for me?",
      "Should I double my dose of metformin?",
      "Can I stop my medication now?",
    ]) {
      const a = assessSafety(q);
      expect(a.risk).toBe("high");
      expect(a.level).toBe("ok");
      expect(a.message).toBe(MEDICATION_REFUSAL_MESSAGE);
    }
  });
});

describe("verifier", () => {
  it("rejects failed, empty and fabricated results", () => {
    expect(verifyToolResult({ ok: false, content: "x" }, "low").valid).toBe(false);
    expect(verifyToolResult({ ok: true, content: "ok" }, "low").valid).toBe(false);
    expect(
      verifyToolResult(
        { ok: true, content: "According to a 2019 study in the Lancet, this is proven." },
        "low",
      ).valid,
    ).toBe(false);
    expect(verifyToolResult(null, "low").valid).toBe(false);
  });
  it("accepts a well-formed result", () => {
    const v = verifyToolResult(
      { ok: true, content: "Here is a clear explanation of the value.", sources: ["Ref"] },
      "medium",
    );
    expect(v.valid).toBe(true);
    expect(v.confidence).toBe("moderate");
  });
  it("grades confidence by support, never as a clinical probability", () => {
    expect(gradeConfidence({ ok: true, content: "x", sources: ["a", "b"] }, "low")).toBe("high");
    expect(gradeConfidence({ ok: true, content: "x", sources: [] }, "medium")).toBe("low");
    expect(gradeConfidence({ ok: true, content: "x", data: { id: "1" } }, "low")).toBe("high");
  });
});

describe("permissions", () => {
  it("treats writes as consequential and requires confirmation", () => {
    expect(isConsequential("create_medicine_reminder", {})).toBe(true);
    expect(isConsequential("appointment_assistance", { action: "create" })).toBe(true);
    expect(isConsequential("appointment_assistance", { action: "list" })).toBe(false);
    expect(isConsequential("search_medical_knowledge", {})).toBe(false);
  });
  it("only accepts a confirmation matching the same tool", () => {
    expect(isConfirmed("create_medicine_reminder", { tool: "create_medicine_reminder", confirmed: true })).toBe(true);
    expect(isConfirmed("create_medicine_reminder", { tool: "appointment_assistance", confirmed: true })).toBe(false);
    expect(isConfirmed("create_medicine_reminder", undefined)).toBe(false);
  });
  it("describes the pending action in plain language", () => {
    expect(
      describeAction("create_medicine_reminder", { medicine_name: "Metformin", reminder_time: "21:00" }),
    ).toMatch(/Metformin/);
  });
});

describe("memory", () => {
  it("remembers medicines and referenced records within a conversation", () => {
    const mem = buildMemory(
      [{ role: "user", content: "Remind me to take Metformin at 9 PM" }],
      "I also have an appointment tomorrow and a blood report",
    );
    expect(mem.mentionedMedicines).toContain("Metformin");
    expect(mem.mentionedAppointment).toBe(true);
    expect(mem.mentionedReport).toBe(true);
    expect(memoryContext(mem)).toMatch(/Metformin/);
  });
});

describe("trusted sources (RAG)", () => {
  it("retrieves relevant curated references", () => {
    const notes = searchTrustedNotes("explain my hba1c result");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]!.id).toBe("hba1c");
    expect(formatTrustedNotes(notes)).toMatch(/Trusted medical reference material/);
  });
  it("returns nothing for unrelated queries", () => {
    expect(searchTrustedNotes("football scores")).toEqual([]);
    expect(formatTrustedNotes([])).toBe("");
  });
});

describe("audit trail", () => {
  it("records ordered, timestamped steps", () => {
    const a = new AuditTrail();
    a.log("Understanding your request...");
    a.log("Safety check completed", "Risk: low");
    expect(a.steps).toEqual(["Understanding your request...", "Safety check completed"]);
    expect(a.activity[1]!.detail).toBe("Risk: low");
    expect(new Date(a.activity[0]!.at).toString()).not.toBe("Invalid Date");
  });
});

describe("reminder time parsing", () => {
  it("parses 12h and 24h times", () => {
    expect(parseTime("9 PM")).toBe("21:00");
    expect(parseTime("07:30")).toBe("07:30");
    expect(parseTime("tomorrow")).toBeNull();
  });
});

describe("tool failures degrade safely", () => {
  it("report tool returns a safe message on a database error", async () => {
    const { client } = stubClient([], { message: "boom" });
    const res = await reportTool.execute({ query: "explain" }, ctx({ supabase: client }));
    expect(res.ok).toBe(false);
    expect(res.content).toMatch(/try again/i);
  });
  it("library tool returns a safe message on a database error", async () => {
    const { client } = stubClient([], { message: "boom" });
    const res = await libraryTool.execute({ query: "labs" }, ctx({ supabase: client }));
    expect(res.ok).toBe(false);
  });
  it("appointment tool asks for details instead of inventing a booking", async () => {
    const res = await appointmentTool.execute({ action: "create" }, ctx());
    expect(res.needsClarification).toBe(true);
    expect(res.content).toMatch(/can't book|cannot book|need/i);
  });
  it("appointment listing reports an empty list rather than fabricating one", async () => {
    const res = await appointmentTool.execute({ action: "list" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.content).toMatch(/don't have any appointments/i);
  });
});

describe("RAG failure handling", () => {
  it("knowledge tool still answers when retrieval and the model both fail", async () => {
    const res = await medicalKnowledgeTool.execute({ query: "what is hba1c" }, ctx());
    expect(typeof res.content).toBe("string");
    expect(res.content.length).toBeGreaterThan(0);
  });
});

describe("data isolation", () => {
  it("denies access to a report belonging to another user", async () => {
    const OTHER = "11111111-1111-1111-1111-111111111111";
    let filteredUser: string | null = null;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "user_id") filteredUser = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    });

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
