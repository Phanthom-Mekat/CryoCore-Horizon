// The finding chart (F07): the finding's median dB on each date against the whole case's p10–p90 range and mean.
// Fixtures are the real frozen case (karnaphuli-estuary, 18 Jun vs 16 Oct 2026); expected values are literals from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findingChart } from "../src/lib/chattogram/finding-chart.ts";

const snap = JSON.parse(readFileSync(new URL("../public/data/chattogram/case/case.json", import.meta.url), "utf8"));
const { detail, findings, timeseries } = snap.curated;
const finding = (id) => findings.features.find((f) => f.properties.id === id);

test("each date shows the finding's median beside the case's mean and p10–p90, on one axis", () => {
  assert.deepEqual(findingChart(finding("chg-e40b17e9cbab"), detail, timeseries), {
    rows: [
      { date: "2026-06-18T23:21:02.000000Z", finding: -13.14, case: { mean: -0.3, p10: -10.49, p90: 2.05 } },
      { date: "2026-10-16T23:20:58.000000Z", finding: -8.08, case: { mean: 0.27, p10: -9.46, p90: 2.35 } },
    ],
    axis: { min: -15, max: 5, ticks: [-15, -10, -5, 0, 5] },
  });
});

test("a date without a case summary shows only the finding there", () => {
  // live mode: the case loads even when its timeseries fails, which leaves no points (CaseProvider)
  assert.deepEqual(findingChart(finding("chg-359508e5c197"), detail, { units: "dB", points: [timeseries.points[1]] }), {
    rows: [
      { date: "2026-06-18T23:21:02.000000Z", finding: 1.77, case: null },
      { date: "2026-10-16T23:20:58.000000Z", finding: -6.68, case: { mean: 0.27, p10: -9.46, p90: 2.35 } },
    ],
    axis: { min: -10, max: 5, ticks: [-10, -5, 0, 5] },
  });
  assert.equal(findingChart(finding("chg-359508e5c197"), detail, { units: "dB", points: [] }).rows.every((r) => r.case === null), true);
});

test("when every value is the same multiple of 5, the axis still spans one step", () => {
  const flat = { ...finding("chg-e40b17e9cbab"), properties: { ...finding("chg-e40b17e9cbab").properties, median_before_db: -10, median_after_db: -10 } };
  assert.deepEqual(findingChart(flat, detail, { units: "dB", points: [] }).axis, { min: -10, max: -5, ticks: [-10, -5] });
});
