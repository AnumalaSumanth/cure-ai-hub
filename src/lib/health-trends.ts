export type SavedTrendAnalysis = {
  record_id: string;
  values: unknown;
  record: {
    id: string;
    title: string;
    file_name: string | null;
    record_date: string | null;
  } | null;
};

export type HealthTrendReading = {
  record_id: string;
  record_title: string;
  document_name: string;
  date: string | null;
  value: string;
  unit: string | null;
  numeric_value: number | null;
  section: string;
  page: number | null;
};

export type HealthTrend = {
  key: string;
  test: string;
  unit: string | null;
  readings: HealthTrendReading[];
  previous: HealthTrendReading | null;
  latest: HealthTrendReading | null;
  difference: number | null;
  observation: "increased" | "decreased" | "stable" | "insufficient";
};

type ParsedMeasurement = { numericValue: number | null; unit: string | null };

function parseMeasurement(result: string): ParsedMeasurement {
  const ratio = result.match(/^\s*[-+]?\d+(?:[.,]\d+)?\s*\/\s*[-+]?\d+(?:[.,]\d+)?\s*(.*)$/);
  if (ratio) return { numericValue: null, unit: parseUnit(ratio[1] ?? "") };

  const match = result.match(/^\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { numericValue: null, unit: null };

  const rawNumber = match[1] ?? "";
  const normalizedNumber = rawNumber.includes(".")
    ? rawNumber.replace(/,/g, "")
    : rawNumber.replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const numericValue = Number(normalizedNumber);
  return {
    numericValue: Number.isFinite(numericValue) ? numericValue : null,
    unit: parseUnit(match[2] ?? ""),
  };
}

function parseUnit(remainder: string): string | null {
  const match = remainder.trim().match(/^[\p{L}%µμ°]+(?:[0-9.^⁰¹²³-]+)?(?:\s*\/\s*[\p{L}%µμ°]+(?:[0-9.^⁰¹²³-]+)?)*/u);
  const unit = match?.[0]?.trim();
  return unit || null;
}

function normalizeKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function roundDifference(value: number): number {
  return Number(value.toPrecision(6));
}

/** Builds source-linked series from saved report analyses; never infers missing dates or units. */
export function buildHealthTrends(rows: SavedTrendAnalysis[]): HealthTrend[] {
  const groups = new Map<string, { test: string; unit: string | null; readings: HealthTrendReading[] }>();
  const seenReports = new Set<string>();

  for (const row of rows) {
    if (!row.record || row.record.id !== row.record_id || !Array.isArray(row.values)) continue;
    for (const value of row.values) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const test = typeof entry.test === "string" ? entry.test.trim() : "";
      const result = typeof entry.result === "string" ? entry.result.trim() : "";
      if (!test || !result || /^not available$/i.test(result)) continue;

      const parsed = parseMeasurement(result);
      const testKey = normalizeKey(test);
      const unitKey = parsed.unit ? normalizeKey(parsed.unit) : "unit-not-recorded";
      const key = `${testKey}::${unitKey}`;
      const reportKey = `${row.record_id}::${key}`;
      if (seenReports.has(reportKey)) continue;
      seenReports.add(reportKey);

      const group = groups.get(key) ?? { test, unit: parsed.unit, readings: [] };
      group.readings.push({
        record_id: row.record_id,
        record_title: row.record.title,
        document_name: row.record.file_name?.trim() || row.record.title,
        date: row.record.record_date,
        value: result,
        unit: parsed.unit,
        numeric_value: parsed.numericValue,
        section: `Important values · ${test}`,
        page: null,
      });
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const readings = group.readings.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      const datedNumeric = group.unit
        ? readings.filter((reading) => reading.date && reading.numeric_value !== null)
        : [];
      const pair = datedNumeric.slice(-2);
      const previous = pair.length === 2 ? pair[0] : null;
      const latest = pair.length === 2 ? pair[1] : null;
      const difference =
        previous?.numeric_value !== null && previous?.numeric_value !== undefined &&
        latest?.numeric_value !== null && latest?.numeric_value !== undefined
          ? roundDifference(latest.numeric_value - previous.numeric_value)
          : null;

      return {
        key,
        test: group.test,
        unit: group.unit,
        readings,
        previous,
        latest,
        difference,
        observation: difference === null ? "insufficient" : difference === 0 ? "stable" : difference > 0 ? "increased" : "decreased",
      };
    })
    .sort((a, b) => a.test.localeCompare(b.test) || (a.unit ?? "").localeCompare(b.unit ?? ""));
}