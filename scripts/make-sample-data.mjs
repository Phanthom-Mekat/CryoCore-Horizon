// Writes SAMPLE dashboard data for Jakobshavn in the exact format scripts/nisar_pipeline.py produces from
// real NISAR products. Everything except the basemap (real HLS imagery) is synthetic and flagged sample: true.
// Usage: node scripts/make-sample-data.mjs <path to basemap-hls.png>
//   basemap-hls.png = NASA GIBS WMS, LAYERS=HLS_S30_Nadir_BRDF_Adjusted_Reflectance, TIME=2025-07-14,
//   CRS=EPSG:4326, BBOX=68.95,-51.3,69.35,-48.3, 3200x1200
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) throw new Error("pass the basemap PNG");
const OUT = fileURLToPath(new URL("../public/data/jakobshavn/", import.meta.url));
for (const d of ["", "speed", "radar"]) mkdirSync(OUT + d, { recursive: true });

const BBOX = [-51.3, 68.95, -48.3, 69.35]; // lon min, lat min, lon max, lat max
const GW = 400;
const GH = 150;
const KM_PX = 0.297; // grid spacing in km (square at 69.15° N)
const SPEED_MAX = 45; // m/day at code 255
const toLon = (x) => BBOX[0] + ((x + 0.5) / GW) * (BBOX[2] - BBOX[0]);
const toLat = (y) => BBOX[3] - ((y + 0.5) / GH) * (BBOX[3] - BBOX[1]);
const r3 = (v) => Math.round(v * 1e4) / 1e4;

// deterministic noise
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// flowline along the Jakobshavn trough, grid px, starting in the fjord west of the 2025 front
const FLOW = [[200, 73.5], [229, 73], [250, 72], [275, 71], [300, 69], [325, 65], [350, 62], [399, 59]];
const segs = [];
let acc = 0;
for (let i = 0; i < FLOW.length - 1; i++) {
  const [x0, y0] = FLOW[i];
  const [x1, y1] = FLOW[i + 1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  segs.push({ x0, y0, dx: (x1 - x0) / len, dy: (y1 - y0) / len, len, s0: acc });
  acc += len;
}
function project(x, y) {
  let best = { d: Infinity, s: 0 };
  for (const g of segs) {
    const t = Math.max(0, Math.min(g.len, (x - g.x0) * g.dx + (y - g.y0) * g.dy));
    const d = Math.hypot(x - (g.x0 + g.dx * t), y - (g.y0 + g.dy * t));
    if (d < best.d) best = { d, s: g.s0 + t };
  }
  return { cross: best.d * KM_PX, s: best.s * KM_PX };
}
const BASE_FRONT_S = (229 - 200) * KM_PX; // km along the flowline

// dates: a pass every 12 days, Nov 2025 to Nov 2026
const day0 = Date.UTC(2025, 10, 7);
const passes = Array.from({ length: 31 }, (_, i) => new Date(day0 + i * 12 * 86400000));
const iso = (d) => d.toISOString().slice(0, 10);
const doy = (d) => (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
const advanceKm = (d) => 2.4 * Math.cos((2 * Math.PI * (doy(d) - 140)) / 365); // most advanced in late May
const peakSpeed = (d) => 21 + 12 * Math.exp(-(((doy(d) - 205) / 40) ** 2)); // summer speed-up
const frontX = (d) => 200 + (BASE_FRONT_S - advanceKm(d)) / KM_PX;

// basemap -> display WebP + low-res RGB for the ice mask
const base = sharp(src).removeAlpha();
await base.clone().resize(2000, 750).webp({ quality: 76 }).toFile(OUT + "basemap.webp");
const small = await base.clone().resize(GW, GH).raw().toBuffer();
const lum = (x, y) => {
  const i = (y * GW + x) * 3;
  return { l: (small[i] + small[i + 1] + small[i + 2]) / 3, b: small[i + 2] - small[i] };
};
const bright = (x, y) => {
  const { l, b } = lum(x, y);
  return l > 195 && b < 40;
};
// ice = bright pixels connected to the ice sheet on the east edge; the fjord west of the front is cut out per date
function iceMask(fx) {
  const m = new Uint8Array(GW * GH);
  const stack = [];
  for (let y = 0; y < GH; y++) if (bright(GW - 1, y)) stack.push(GW - 1, y);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const i = y * GW + x;
    if (m[i] || !bright(x, y) || (y > 58 && y < 88 && x < fx)) continue;
    m[i] = 1;
    if (x > 0) stack.push(x - 1, y);
    if (x < GW - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < GH - 1) stack.push(x, y + 1);
  }
  return m;
}

// speed grids: one per 12-day pair, gray = speed / SPEED_MAX * 255, alpha 0 = no data
const pairs = [];
const geo = Array.from({ length: GW * GH }, (_, i) => project(i % GW, Math.floor(i / GW)));
for (let p = 0; p < passes.length - 1; p++) {
  const a = passes[p];
  const b = passes[p + 1];
  const mid = new Date((a.getTime() + b.getTime()) / 2);
  const fx = frontX(mid);
  const A = peakSpeed(mid);
  const buf = Buffer.alloc(GW * GH * 2);
  const ice = iceMask(fx);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (!ice[i]) continue;
      const { s, cross } = geo[i];
      const sr = Math.max(0, s - (BASE_FRONT_S - advanceKm(mid)));
      const v = A * Math.exp(-sr / 17) * Math.exp(-((cross / 3.2) ** 2)) + 1.1 * Math.exp(-sr / 90) * Math.exp(-((cross / 14) ** 2)) + 0.12 + (rand() - 0.5) * 0.5;
      buf[i * 2] = Math.max(1, Math.min(255, Math.round((Math.max(v, 0) / SPEED_MAX) * 255)));
      buf[i * 2 + 1] = 255;
    }
  const name = `speed/${iso(a)}_${iso(b)}.png`;
  await sharp(buf, { raw: { width: GW, height: GH, channels: 2 } }).png({ compressionLevel: 9 }).toFile(OUT + name);
  pairs.push({ start: iso(a), end: iso(b), days: 12, speed: name });
}

// probes and their speed time series, read back from the grids we just wrote
const probes = [
  { id: "front", label: "Near the front", s: BASE_FRONT_S + 2.5 },
  { id: "upstream", label: "20 km upstream", s: BASE_FRONT_S + 20 },
].map((p) => {
  let best = 0;
  for (let i = 1; i < geo.length; i++) if (Math.abs(geo[i].s - p.s) + geo[i].cross < Math.abs(geo[best].s - p.s) + geo[best].cross) best = i;
  const x = best % GW;
  const y = Math.floor(best / GW);
  return { id: p.id, label: p.label, lon: r3(toLon(x)), lat: r3(toLat(y)), x, y };
});
const series = [];
for (const pair of pairs) {
  const { data, info } = await sharp(OUT + pair.speed).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // sharp may expand gray+alpha; alpha is always the last channel
  const row = { start: pair.start, end: pair.end };
  for (const pr of probes) {
    let sum = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((pr.y + dy) * GW + pr.x + dx) * ch;
        if (data[i + ch - 1]) {
          sum += (data[i] / 255) * SPEED_MAX;
          n++;
        }
      }
    row[pr.id] = n ? Math.round((sum / n) * 10) / 10 : null;
  }
  series.push(row);
}

// calving fronts: a jagged line across the fjord at each pass, and its advance (+) or retreat (−) in km
const fronts = passes.map((d) => {
  const fx = frontX(d);
  const line = [];
  for (let y = 60; y <= 86; y += 2) line.push([r3(toLon(fx + Math.sin(y * 1.7 + doy(d) * 0.05) * 1.6 + (y - 73) ** 2 * 0.03)), r3(toLat(y))]);
  return { date: iso(d), advanceKm: Math.round(advanceKm(d) * 100) / 100, line };
});

// radar previews for every 4th pass: SAR-like grayscale from the basemap, with that date's front
const RW = 1000;
const RH = 375;
const big = await base.clone().resize(RW, RH).raw().toBuffer();
const radarDates = new Set(passes.filter((_, i) => i % 4 === 0).map(iso));
for (const d of passes) {
  if (!radarDates.has(iso(d))) continue;
  const out = Buffer.alloc(RW * RH);
  const fx = (frontX(d) / GW) * RW;
  const baseFx = (229 / GW) * RW;
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const i = (y * RW + x) * 3;
      const r = big[i];
      const g = big[i + 1];
      const b = big[i + 2];
      const l = (r + g + b) / 3;
      let v = b - r > 25 && l < 120 ? 18 : l > 195 ? 150 + (l - 195) * 1.2 : 55 + l * 0.45; // water dark, ice bright, rock mid
      const fy = (y / RH) * GH;
      const edge = fx + Math.sin(y * 0.21) * 6; // ragged calving face
      if (fy > 60 && fy < 86 && l > 180) {
        if (x >= edge && x < baseFx) v = 165; // ice has advanced over July's mélange
        if (x < edge && x >= baseFx) v = 85 + rand() * 60; // retreat: broken mélange
      }
      v *= 0.65 + rand() * 0.7; // speckle
      out[y * RW + x] = Math.max(0, Math.min(255, v));
    }
  await sharp(out, { raw: { width: RW, height: RH, channels: 1 } }).webp({ quality: 70 }).toFile(OUT + `radar/${iso(d)}.webp`);
}

const manifest = {
  sample: true,
  note: "SAMPLE DATA for layout and testing. Speeds, fronts and radar images are synthetic. Replace by running scripts/nisar_pipeline.py.",
  glacier: "Sermeq Kujalleq (Jakobshavn Isbræ)",
  bbox: BBOX,
  basemap: { src: "basemap.webp", caption: "Sentinel-2 via NASA HLS, 14 Jul 2025 (NASA GIBS)" },
  grid: { width: GW, height: GH },
  speedMax: SPEED_MAX,
  units: "m/day",
  passes: passes.map((d) => ({ date: iso(d), direction: "D", track: 170, frame: 53, radar: radarDates.has(iso(d)) ? `radar/${iso(d)}.webp` : null })),
  pairs,
  probes: probes.map(({ id, label, lon, lat }) => ({ id, label, lon, lat })),
};
writeFileSync(OUT + "manifest.json", JSON.stringify(manifest, null, 1));
writeFileSync(OUT + "timeseries.json", JSON.stringify({ sample: true, units: "m/day", series }, null, 1));
writeFileSync(
  OUT + "fronts.json",
  JSON.stringify({ sample: true, flowline: FLOW.map(([x, y]) => [r3(toLon(x)), r3(toLat(y))]), fronts }, null, 1),
);
console.log(`wrote ${pairs.length} speed grids, ${radarDates.size} radar previews, ${fronts.length} fronts`);
