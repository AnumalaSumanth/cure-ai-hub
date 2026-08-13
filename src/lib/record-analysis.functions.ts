import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { withAiFallback, MEDICAL_SAFETY_SYSTEM } from "./ai-provider.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const RECORD_ANALYSIS_DISCLAIMER =
  "AI-generated analysis is for informational purposes only and is not a medical diagnosis or a substitute for professional medical advice.";

export type RecordValueRow = {
  test: string;
  result: string;
  reference_range: string;
  status: "Normal" | "High" | "Low" | "Abnormal" | "Not Available";
};

export type AbnormalItem = {
  test: string;
  direction: string;
  measures: string;
  explanation: string;
};

export type RecordAnalysisResult = {
  ok: boolean;
  unreadable?: boolean;
  message?: string;
  summary: string;
  key_findings: string[];
  values: RecordValueRow[];
  abnormal: AbnormalItem[];
  simple_explanation: string;
  doctor_questions: string[];
  urgent_note: string;
  disclaimer: string;
};

const STORAGE_PREFIX = "storage:";
const BUCKET = "medical-library";

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1]! : text).trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct) return direct;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const slice = candidate.slice(first, last + 1);
    return tryParse(slice) ?? tryParse(slice.replace(/,\s*([}\]])/g, "$1"));
  }
  return null;
}

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

const STATUSES: RecordValueRow["status"][] = ["Normal", "High", "Low", "Abnormal", "Not Available"];

function normalize(raw: unknown): RecordAnalysisResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const values = Array.isArray(r.values)
    ? (r.values as Record<string, unknown>[]).map((v) => {
        const status = String(v?.status ?? "Not Available");
        const match = STATUSES.find((s) => s.toLowerCase() === status.toLowerCase());
        return {
          test: String(v?.test ?? "").trim(),
          result: String(v?.result ?? "").trim() || "Not Available",
          reference_range: String(v?.reference_range ?? "").trim() || "Not Available",
          status: match ?? "Not Available",
        };
      }).filter((v) => v.test)
    : [];
  const abnormal = Array.isArray(r.abnormal)
    ? (r.abnormal as Record<string, unknown>[]).map((a) => ({
        test: String(a?.test ?? "").trim(),
        direction: String(a?.direction ?? "").trim(),
        measures: String(a?.measures ?? "").trim(),
        explanation: String(a?.explanation ?? "").trim(),
      })).filter((a) => a.test)
    : [];
  return {
    ok: true,
    unreadable: Boolean(r.unreadable),
    summary: String(r.summary ?? "").trim(),
    key_findings: asStrings(r.key_findings),
    values,
    abnormal,
    simple_explanation: String(r.simple_explanation ?? "").trim(),
    doctor_questions: asStrings(r.doctor_questions),
    urgent_note: String(r.urgent_note ?? "").trim(),
    disclaimer: RECORD_ANALYSIS_DISCLAIMER,
  };
}

function empty(message: string, unreadable = true): RecordAnalysisResult {
  return {
    ok: false,
    unreadable,
    message,
    summary: "",
    key_findings: [],
    values: [],
    abnormal: [],
    simple_explanation: "",
    doctor_questions: [],
    urgent_note: "",
    disclaimer: RECORD_ANALYSIS_DISCLAIMER,
  };
}

const INSTRUCTIONS = `${MEDICAL_SAFETY_SYSTEM}

You are analysing a health report document that the user uploaded for themselves.

Absolute rules:
- Never diagnose, never prescribe, never suggest starting, stopping or changing any medication or dose.
- Never invent test values, reference ranges, findings or medical history. If something is not in the document, use "Not Available".
- Only mark a value abnormal if the document itself provides a reference range showing it is outside that range.
- Clearly separate what the report states from your plain-language explanation.
- If the document is unclear, unreadable or is not a medical report, set "unreadable": true and explain that in "summary".
- If findings look potentially urgent, put a short recommendation to seek appropriate medical care in "urgent_note" (otherwise empty string).

Reply with ONLY a JSON object of this exact shape:
{
  "unreadable": false,
  "summary": "short plain-language summary of what the report contains",
  "key_findings": ["..."],
  "values": [{"test":"","result":"","reference_range":"","status":"Normal|High|Low|Abnormal|Not Available"}],
  "abnormal": [{"test":"","direction":"above/below the provided range","measures":"what this test generally measures","explanation":"simple, non-diagnostic explanation of what this may indicate"}],
  "simple_explanation": "beginner-friendly explanation of the whole report",
  "doctor_questions": ["questions based only on findings in this report"],
  "urgent_note": ""
}`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const analyzeHealthRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ recordId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RecordAnalysisResult> => {
    const { supabase, userId } = context;

    const { data: record, error } = await supabase
      .from("health_records")
      .select("id, title, file_url, file_name, file_type, record_type, record_date, notes")
      .eq("id", data.recordId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[record-analysis] db error", error.message);
      return empty("We couldn't load that record right now. Please try again.");
    }
    if (!record) return empty("That record could not be found in your account.");
    if (!record.file_url || !record.file_url.startsWith(STORAGE_PREFIX)) {
      return empty("This record has no uploaded document to analyse. Add a PDF, JPG or PNG file to it first.");
    }

    const path = record.file_url.slice(STORAGE_PREFIX.length);
    const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(path);
    if (dlError || !file) {
      console.error("[record-analysis] download failed", dlError?.message);
      return empty("We couldn't open the uploaded document. Please re-upload it and try again.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = (record.file_type || file.type || "").toLowerCase();
    const meta = [
      `Record name: ${record.title}`,
      record.record_type ? `Record type: ${record.record_type}` : "",
      record.record_date ? `Record date: ${record.record_date}` : "",
      record.notes ? `User notes: ${record.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    type Part =
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; data: string; mediaType: string };

    const parts: Part[] = [{ type: "text", text: `${INSTRUCTIONS}\n\n${meta}` }];

    if (mime.startsWith("image/")) {
      parts.push({ type: "image", image: `data:${mime};base64,${toBase64(bytes)}` });
    } else if (mime.includes("pdf")) {
      parts.push({ type: "file", data: toBase64(bytes), mediaType: "application/pdf" });
    } else {
      let text = "";
      try {
        text = new TextDecoder().decode(bytes).slice(0, 20000);
      } catch {
        text = "";
      }
      // eslint-disable-next-line no-control-regex
      if (!text.trim() || /[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 500))) {
        return empty("This file type can't be read for analysis. Please upload the report as a PDF, JPG or PNG.");
      }
      parts.push({ type: "text", text: `Report contents:\n"""\n${text}\n"""` });
    }

    try {
      const out = await withAiFallback(async (model) => {
        const res = await generateText({
          model,
          messages: [{ role: "user", content: parts as never }],
          maxOutputTokens: 2500,
        });
        return res.text.trim();
      });
      const parsed = extractJsonObject(out);
      if (!parsed) {
        return empty("The analysis couldn't be completed for this document. Please try again.", false);
      }
      const result = normalize(parsed);
      if (!result.summary && !result.values.length && !result.key_findings.length) {
        return empty(
          "We couldn't read enough from this document to analyse it. Please upload a clearer copy.",
        );
      }
      return result;
    } catch (err) {
      console.error("[record-analysis] ai failed", (err as Error)?.message);
      return empty(
        "The AI analysis service couldn't process this document right now. Please try again shortly.",
        false,
      );
    }
  });
