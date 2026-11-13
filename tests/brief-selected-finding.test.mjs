// The observation brief follows the finding picked on Explore (URL `f`). Fixtures are the real frozen case
// (karnaphuli-estuary, 18 Jun vs 16 Oct 2026); expected values are literals read from that snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { briefCsv, briefGeojson, briefJson } from "../src/lib/chattogram/brief.ts";

const snap = JSON.parse(readFileSync(new URL("../public/data/chattogram/case/case.json", import.meta.url), "utf8"));
const region = snap.explorer.region;
const day = (d) => snap.acquisitions.find((a) => a.stack === "069_A_013" && a.day === d);
const [before, after] = [day("2026-06-18"), day("2026-10-16")];
const { detail, layers, findings, timeseries, sensitivity } = snap.curated;
const pc = { detail, layers, findings, timeseries, sensitivity };
const frozen = { mode: "frozen", frozenAt: snap.frozenAt, fallback: false };
const SHARE = "https://cryocore.example/chattogram/evidence?stack=069_A_013&a=2026-06-18&b=2026-10-16&f=chg-e40b17e9cbab";
const REPLAY = "https://cryocore.example/chattogram/evidence?stack=069_A_013&a=2026-06-18&b=2026-10-16&source=frozen";
const json = (f) => briefJson(region, before, after, SHARE, frozen, REPLAY, null, pc, null, f);

test("the JSON brief names the selected finding with its values, outline, sources and method", () => {
  const s = json("chg-e40b17e9cbab").selected_finding;
  assert.equal(s.id, "chg-e40b17e9cbab");
  assert.equal(s.kind, "increase");
  assert.equal(s.area_km2, 0.2135);
  assert.equal(s.mean_delta_db, 5.02);
  assert.equal(s.median_before_db, -13.14);
  assert.equal(s.median_after_db, -8.08);
  assert.equal(s.quality, "moderate");
  assert.match(s.quality_reason, /^Moderate: passes every check/);
  assert.equal(s.geometry.type, "Polygon");
  assert.equal(s.geometry.coordinates[0].length, 175);
  assert.equal(s.method_version, "Single-pair signed gamma0 backscatter change/0.2.0");
  assert.deepEqual(s.pair_dates, { before: "2026-06-18T23:21:02.000000Z", after: "2026-10-16T23:20:58.000000Z" });
  assert.equal(s.same_pair_as_compared, true);
  assert.deepEqual(
    s.source_granules,
    [
      "NISAR_L2_PR_GCOV_023_069_A_013_4005_DHDH_A_20260618T232102_20260618T232136_P05023_N_F_J_001",
      "NISAR_L2_PR_GCOV_033_069_A_013_4005_DHDH_A_20261016T232058_20261016T232133_P05023_N_F_J_001",
    ],
  );
});

test("the selected finding's replay link opens that finding in the frozen case", () => {
  const link = new URL(json("chg-e40b17e9cbab").selected_finding.replay_url);
  assert.equal(link.searchParams.get("f"), "chg-e40b17e9cbab");
  assert.equal(link.searchParams.get("source"), "frozen");
  assert.equal(link.searchParams.get("a"), "2026-06-18");
});

test("the selected finding keeps a link with `f` even live, where there is no replay link", () => {
  const live = briefJson(region, before, after, SHARE.replace("&f=chg-e40b17e9cbab", ""), { ...frozen, mode: "live" }, null, null, pc, null, "chg-e40b17e9cbab");
  assert.equal(live.selected_finding.replay_url, null);
  assert.equal(new URL(live.selected_finding.share_url).searchParams.get("f"), "chg-e40b17e9cbab");
});

test("a finding selected while Evidence compares other dates says it was measured on the case pair", () => {
  const other = briefJson(region, day("2026-07-12"), after, SHARE, frozen, REPLAY, null, pc, null, "chg-e40b17e9cbab").selected_finding;
  assert.equal(other.same_pair_as_compared, false);
  assert.deepEqual(other.pair_dates, { before: "2026-06-18T23:21:02.000000Z", after: "2026-10-16T23:20:58.000000Z" });
});

test("without a selection, or with a finding the case doesn't have, the brief names no finding", () => {
  assert.equal(json(null).selected_finding, null);
  assert.equal(json("chg-not-in-this-case").selected_finding, null);
});

/** RFC 4180 rows as objects keyed by the header (quoted fields may hold commas, quotes and newlines). */
function parseCsv(text) {
  const rows = [[""]];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const row = rows[rows.length - 1];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        row[row.length - 1] += '"';
        i++;
      } else if (c === '"') quoted = false;
      else row[row.length - 1] += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push("");
    else if (c === "\n") rows.push([""]);
    else row[row.length - 1] += c;
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

test("the CSV marks only the selected finding's row", () => {
  const findingRows = parseCsv(briefCsv(before, after, pc, "chg-e40b17e9cbab")).filter((r) => r.role === "finding");
  assert.equal(findingRows.length, 40);
  assert.deepEqual(findingRows.filter((r) => r.selected === "true").map((r) => r.id), ["chg-e40b17e9cbab"]);
  assert.equal(findingRows.filter((r) => r.selected === "false").length, 39);
});

test("the GeoJSON marks only the selected finding's feature", () => {
  const features = briefGeojson(before, after, pc, "chg-e40b17e9cbab").features.filter((x) => x.properties.role === "finding");
  assert.equal(features.length, 40);
  assert.deepEqual(features.filter((x) => x.properties.selected === true).map((x) => x.properties.id), ["chg-e40b17e9cbab"]);
  assert.equal(features.filter((x) => x.properties.selected === false).length, 39);
});

test("without a selection, or with a finding the case doesn't have, no CSV row or GeoJSON feature is marked", () => {
  for (const id of [null, "chg-not-in-this-case"]) {
    const rows = parseCsv(briefCsv(before, after, pc, id)).filter((r) => r.role === "finding");
    assert.deepEqual([...new Set(rows.map((r) => r.selected))], ["false"]);
    const features = briefGeojson(before, after, pc, id).features.filter((x) => x.properties.role === "finding");
    assert.deepEqual([...new Set(features.map((x) => x.properties.selected))], [false]);
  }
});

test("the brief carries the threshold sweep, how far the finding holds, and its HV change", () => {
  const b = json("chg-e40b17e9cbab");
  assert.equal(b.processed_case.threshold_sensitivity.published_threshold_db, 3);
  assert.equal(b.selected_finding.still_found_up_to_threshold_db, sensitivity.highest_threshold_by_finding["chg-e40b17e9cbab"]);
  assert.equal(typeof b.selected_finding.cross_pol_mean_delta_db, "number");
  assert.equal(b.processed_case.metrics.cross_pol.polarization, "HV");
});

test("the GeoJSON brief includes the calibrated pilot's window when the pilot is given", () => {
  const pilot = snap.pilot.case;
  const fc = briefGeojson(before, after, pc, null, pilot);
  const win = fc.features.find((f) => f.properties.role === "calibrated_pilot_window");
  assert.equal(win.geometry.type, "Polygon");
  assert.equal(win.properties.case_id, pilot.id);
  assert.equal(win.properties.covers_compared_pair, false); // the pilot is a different pair
  assert.equal(briefGeojson(before, after, pc, null).features.some((f) => f.properties.role === "calibrated_pilot_window"), false);
});
