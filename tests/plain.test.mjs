import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { categoryOf, inside, pixelAt } from "../src/lib/chattogram/plain.ts";

const frozen = JSON.parse(readFileSync(new URL("../public/data/chattogram/case/case.json", import.meta.url), "utf8"));
const layer = frozen.curated.layers.find((l) => l.id === "plain");

test("the frozen case has a plain layer with every category", () => {
  assert.ok(layer, "re-run pnpm freeze-case after processing the case");
  assert.deepEqual(layer.categories.map((c) => c.id), ["water", "object", "water_came", "water_went", "plants_grew", "plants_lost", "surface"]);
  assert.equal(Object.keys(layer.by_finding).length, frozen.curated.findings.features.length);
});

test("every coloured pixel of plain.png reads back as its category, in the backend's proportions", async () => {
  const file = new URL(`../public${layer.url}`, import.meta.url);
  const { data, info } = await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = {};
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const id = categoryOf(layer, data.subarray(i, i + 4));
    assert.ok(id, `pixel ${i / 4} has no category`);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  // the PNG is resampled to lon/lat, so pixel shares match the native-grid areas only approximately
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const area = layer.categories.reduce((a, c) => a + c.area_km2, 0);
  for (const c of layer.categories) assert.ok(Math.abs((counts[c.id] ?? 0) / total - c.area_km2 / area) < 0.01, c.id);
  assert.ok(info.width > 0);
});

test("colour rounding and the two water shades", () => {
  const cats = { categories: [{ id: "water", color: "#3987e5" }, { id: "water_came", color: "#3987e5" }, { id: "plants_grew", color: "#199e70" }] };
  assert.equal(categoryOf(cats, [0x39, 0x86, 0xe6, 90]), "water"); // off by one after a canvas round trip
  assert.equal(categoryOf(cats, [0x39, 0x87, 0xe5, 235]), "water_came");
  assert.equal(categoryOf(cats, [0x19, 0x9e, 0x70, 235]), "plants_grew");
  assert.equal(categoryOf(cats, [0x19, 0x9e, 0x70, 0]), null);
  assert.equal(categoryOf(cats, [255, 0, 0, 255]), null);
});

test("pixel lookup and the analysis rectangle", () => {
  const corners = [[91.79, 22.38], [91.9, 22.38], [91.9, 22.24], [91.79, 22.24]];
  assert.deepEqual(pixelAt(corners, 110, 140, [91.79, 22.38]), { x: 0, y: 0 });
  assert.deepEqual(pixelAt(corners, 110, 140, [91.8995, 22.2405]), { x: 109, y: 139 });
  assert.equal(pixelAt(corners, 110, 140, [91.95, 22.3]), null);
  const area = frozen.curated.detail.analysis_area.geometry;
  assert.ok(inside(area, [91.85, 22.3]));
  assert.ok(!inside(area, [91.7, 22.3]));
});
