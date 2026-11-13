import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRadarState, radarQuery } from "../src/lib/chattogram/processed-state.ts";

test("share round-trip keeps exact pixel, case and comparison controls", () => {
  const state = { caseId: "6573c8bc5837ede3c0541563", mode: "swipe", polarization: "HVHV", opacity: 0,
    split: 72, view: { lon: 91.845342345, lat: 22.33234324, zoom: 14.6 }, point: [91.845342345,22.33234324], area: null };
  assert.deepEqual(parseRadarState(new URLSearchParams(radarQuery(state))), state);
});
test("malformed coordinates and controls never reach the map", () => {
  const result = parseRadarState(new URLSearchParams("rv=NaN,91,Infinity&rp=91,22,23&opacity=-1&split=101&pol=bad&layer=bad"));
  assert.deepEqual(result.view, {lon:91.845,lat:22.33,zoom:13});
  assert.equal(result.point,null);
  assert.equal(result.opacity,0.85);
  assert.equal(result.split,50);
  assert.equal(result.mode,"change");
  assert.equal(result.polarization,"HHHH");
});
test("missing coordinates stay absent, zero remains a valid coordinate", () => {
  assert.equal(parseRadarState(new URLSearchParams("rp=,")).point,null);
  assert.deepEqual(parseRadarState(new URLSearchParams("rp=0,0")).point,[0,0]);
});
test("invalid explicit case is retained for a visible error, not silently replaced", () => {
  assert.equal(parseRadarState(new URLSearchParams("case=bad")).caseId,"bad");
  assert.throws(() => radarQuery({...parseRadarState(new URLSearchParams()),caseId:"bad"}));
});
test("an area selection survives the share link exactly; malformed corners are dropped", async () => {
  const { areaQuery } = await import("../src/lib/chattogram/processed-state.ts");
  const base = parseRadarState(new URLSearchParams());
  const area = [[91.84123456789, 22.3301], [91.85, 22.31987654321]];
  const state = { ...base, caseId: "6573c8bc5837ede3c0541563", area };
  assert.deepEqual(parseRadarState(new URLSearchParams(radarQuery(state))).area, area);
  assert.deepEqual(parseRadarState(new URLSearchParams(areaQuery(area))).area, area);
  assert.equal(areaQuery(null), "");
  for (const bad of ["91,22,91.1", "91,22,91.1,NaN", "91,22,191,22.1", "91,22,91.1,86", "a,b,c,d", ",,,"])
    assert.equal(parseRadarState(new URLSearchParams({ ra: bad })).area, null, bad);
  assert.equal(base.area, null);
});
