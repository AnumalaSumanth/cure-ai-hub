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
  secondary_numeric_value: number | null;
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
  observation: "increased" | "decreased" | "stable" | "changed" | "insufficient";
  secondary_difference: number | null;
};

type ParsedMeasurement = { numericValue: number | null; secondaryNumericValue: number | null; unit: string | null };

function parseMeasurement(result: string): ParsedMeasurement {
  const ratio = result.match(/^\s*[-+]?\d+(?:[.,]\d+)?\s*\/\s*[-+]?\d+(?:[.,]\d+)?\s*(.*)$/);
  if (ratio) {
    const first = Number((ratio[0] ?? "").split("/")[0]?.trim().replace(",", "."));
    const second = Number((ratio[0] ?? "").split("/")[1]?.trim().match(/^[-+]?\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    return {
      numericValue: Number.isFinite(first) ? first : null,
      secondaryNumericValue: Number.isFinite(second) ? second : null,
      unit: parseUnit(ratio[1] ?? ""),
    };
  }

  const match = result.match(/^\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { numericValue: null, secondaryNumericValue: null, unit: null };

  const rawNumber = match[1] ?? "";
  const normalizedNumber = rawNumber.includes(".")
    ? rawNumber.replace(/,/g, "")
    : rawNumber.replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const numericValue = Number(normalizedNumber);
  return {
    numericValue: Number.isFinite(numericValue) ? numericValue : null,
    secondaryNumericValue: null,
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
        secondary_numeric_value: parsed.secondaryNumericValue,
        section: `Saved analysis · ${test}`,
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
      const datedReadings = readings.filter((reading) => reading.date);
      const previous = datedReadings.length >= 2 ? datedReadings[datedReadings.length - 2] ?? null : null;
      const latest = datedReadings[datedReadings.length - 1] ?? null;
      let difference: number | null = null;
      let secondaryDifference: number | null = null;
      if (
        previous && latest && group.unit &&
        previous.numeric_value !== null && latest.numeric_value !== null
      ) {
        difference = roundDifference(latest.numeric_value - previous.numeric_value);
        if (previous.secondary_numeric_value !== null && latest.secondary_numeric_value !== null) {
          secondaryDifference = roundDifference(latest.secondary_numeric_value - previous.secondary_numeric_value);
        }
      }
      const observation: HealthTrend["observation"] =
        difference === null
          ? "insufficient"
          : difference === 0 && (secondaryDifference === null || secondaryDifference === 0)
            ? "stable"
            : secondaryDifference !== null && difference !== 0 && Math.sign(difference) !== Math.sign(secondaryDifference)
              ? "changed"
              : difference > 0 || (secondaryDifference !== null && secondaryDifference > 0)
                ? "increased"
                : "decreased";

      return {
        key,
        test: group.test,
        unit: group.unit,
        readings,
        previous,
        latest,
        difference,
        secondary_difference: secondaryDifference,
        observation,
      };
    })
    .sort((a, b) => a.test.localeCompare(b.test) || (a.unit ?? "").localeCompare(b.unit ?? ""));
}