import { describe, expect, it } from "vitest";
import { buildHealthTrends, type SavedTrendAnalysis } from "../health-trends";

function analysis(
  recordId: string,
  recordDate: string | null,
  values: unknown,
  title = `Report ${recordId}`,
): SavedTrendAnalysis {
  return {
    record_id: recordId,
    values,
    record: { id: recordId, title, file_name: `${title}.pdf`, record_date: recordDate },
  };
}

describe("buildHealthTrends", () => {
  it("orders actual report values by date and calculates differences only for matching units", () => {
    const trends = buildHealthTrends([
      analysis("later", "2026-05-10", [{ test: "Hemoglobin", result: "14.0 g/dL" }]),
      analysis("earlier", "2026-01-10", [{ test: "Hemoglobin", result: "13.2 g/dL" }]),
    ]);

    expect(trends).toHaveLength(1);
    expect(trends[0]?.readings.map((reading) => reading.date)).toEqual(["2026-01-10", "2026-05-10"]);
    expect(trends[0]?.difference).toBe(0.8);
    expect(trends[0]?.readings[0]?.document_name).toBe("Report earlier.pdf");
  });

  it("keeps measurements with different units in separate non-comparable series", () => {
    const trends = buildHealthTrends([
      analysis("a", "2026-01-10", [{ test: "Glucose", result: "90 mg/dL" }]),
      analysis("b", "2026-05-10", [{ test: "Glucose", result: "5.0 mmol/L" }]),
    ]);

    expect(trends).toHaveLength(2);
    expect(trends.every((trend) => trend.difference === null)).toBe(true);
  });

  it("does not compare unknown-unit or undated results", () => {
    const trends = buildHealthTrends([
      analysis("a", "2026-01-10", [{ test: "Marker", result: "4.1" }]),
      analysis("b", "2026-05-10", [{ test: "Marker", result: "4.4" }]),
      analysis("c", null, [{ test: "Dated result", result: "7.2 mmol/L" }]),
    ]);

    expect(trends.every((trend) => trend.difference === null)).toBe(true);
    expect(trends.find((trend) => trend.test === "Dated result")?.readings[0]?.date).toBeNull();
  });

  it("tracks both recorded components of a ratio measurement such as blood pressure", () => {
    const trends = buildHealthTrends([
      analysis("early", "2026-01-10", [{ test: "Blood pressure", result: "120/80 mmHg" }]),
      analysis("late", "2026-05-10", [{ test: "Blood pressure", result: "125/82 mmHg" }]),
    ]);

    expect(trends[0]?.difference).toBe(5);
    expect(trends[0]?.secondary_difference).toBe(2);
    expect(trends[0]?.observation).toBe("increased");
  });

  it("skips unavailable values and avoids counting a re-analysis of the same report twice", () => {
    const trends = buildHealthTrends([
      analysis("same-report", "2026-04-01", [
        { test: "Cholesterol", result: "190 mg/dL" },
        { test: "Unreported", result: "Not Available" },
      ]),
      analysis("same-report", "2026-04-01", [{ test: "Cholesterol", result: "190 mg/dL" }]),
    ]);

    expect(trends).toHaveLength(1);
    expect(trends[0]?.readings).toHaveLength(1);
    expect(trends[0]?.readings[0]?.section).toBe("Saved analysis · Cholesterol");
  });

  it("shows a dated latest value even when there is not enough history for comparison", () => {
    const trends = buildHealthTrends([
      analysis("one-report", "2026-05-12", [{ test: "Vitamin D", result: "28 ng/mL" }]),
    ]);

    expect(trends[0]?.previous).toBeNull();
    expect(trends[0]?.latest?.value).toBe("28 ng/mL");
    expect(trends[0]?.difference).toBeNull();
  });
});