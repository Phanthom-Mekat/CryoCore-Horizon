import { test } from "node:test";
import assert from "node:assert/strict";
import { selectFinding } from "../src/lib/chattogram/finding-selection.ts";

const finding = (id) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { id, kind: "increase" } });
const ready = { detail: { id: "karnaphuli-estuary" }, layers: [], findings: { type: "FeatureCollection", features: [finding("chg-a"), finding("chg-b")] }, timeseries: { units: "dB", points: [] } };

test("a finding named in the link is the selected one", () => {
  assert.deepEqual(selectFinding(ready, "chg-b"), { kind: "selected", finding: finding("chg-b") });
});

test("without a finding in the link nothing is selected", () => {
  assert.deepEqual(selectFinding(ready, null), { kind: "none" });
});

test("a finding the case doesn't have is reported as unknown", () => {
  assert.deepEqual(selectFinding(ready, "chg-gone"), { kind: "unknown", id: "chg-gone" });
});

test("while the case hasn't loaded, a finding in the link is neither selected nor unknown yet", () => {
  assert.deepEqual(selectFinding(null, "chg-a"), { kind: "none" });
});
