// The finding chart (F07): the finding's stored medians against the whole case's stored per-date summary. No new numbers.
import type { CaseDetail, Finding, Timeseries } from "./case-api";

type FindingChartRow = { date: string; finding: number; case: { mean: number; p10: number; p90: number } | null };
export type FindingChartData = { rows: FindingChartRow[]; axis: { min: number; max: number; ticks: number[] } };

const STEP = 5; // dB between axis ticks

export function findingChart(finding: Finding, detail: Pick<CaseDetail, "before" | "after">, timeseries: Timeseries): FindingChartData {
  const p = finding.properties;
  // matched by granule, like the timeline, so a value is never shown against a different product of the same day
  const row = (acq: CaseDetail["before"], median: number): FindingChartRow => {
    const pt = timeseries.points.find((x) => x.granule === acq.granule);
    return { date: acq.date, finding: median, case: pt ? { mean: pt.mean_db, p10: pt.p10_db, p90: pt.p90_db } : null };
  };
  const rows = [row(detail.before, p.median_before_db), row(detail.after, p.median_after_db)];
  const vals = rows.flatMap((r) => [r.finding, ...(r.case ? [r.case.p10, r.case.mean, r.case.p90] : [])]);
  const min = Math.floor(Math.min(...vals) / STEP) * STEP;
  const max = Math.max(Math.ceil(Math.max(...vals) / STEP) * STEP, min + STEP); // never a zero-width axis
  const ticks = Array.from({ length: (max - min) / STEP + 1 }, (_, i) => min + i * STEP);
  return { rows, axis: { min, max, ticks } };
}
