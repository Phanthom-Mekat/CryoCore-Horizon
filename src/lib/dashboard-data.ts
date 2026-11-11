// File contract for /public/data/jakobshavn, written by scripts/nisar_pipeline.py (real data)
// or scripts/make-sample-data.mjs (sample). Keep both writers and these types in step.

export type Pass = { date: string; direction: "A" | "D" | "?"; track: number | null; frame: number | null; radar: string | null };
export type Pair = { start: string; end: string; days: number; speed: string };
export type Probe = { id: string; label: string; lon: number; lat: number };
export type Manifest = {
  sample: boolean;
  note?: string;
  /** NISAR data maturity of the products used: "BETA", "PROVISIONAL" or "VALIDATED". Optional; shown next to the data status. */
  maturity?: string;
  glacier: string;
  bbox: [number, number, number, number]; // lon min, lat min, lon max, lat max (EPSG:4326)
  basemap: { src: string; caption: string };
  grid: { width: number; height: number };
  speedMax: number; // value of code 255 in the speed PNGs
  units: string;
  passes: Pass[];
  pairs: Pair[];
  probes: Probe[];
};
export type SeriesRow = { start: string; end: string } & Record<string, number | null | string>;
export type TimeSeries = { sample: boolean; units: string; series: SeriesRow[] };
export type Front = { date: string; advanceKm: number; line: [number, number][] };
export type Fronts = { sample: boolean; flowline: [number, number][]; fronts: Front[] };

export const DATA_ROOT = "/data/jakobshavn/";

export async function loadDashboardData() {
  const get = async <T,>(f: string): Promise<T> => {
    const r = await fetch(DATA_ROOT + f);
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return r.json() as Promise<T>;
  };
  const [manifest, timeseries, fronts] = await Promise.all([get<Manifest>("manifest.json"), get<TimeSeries>("timeseries.json"), get<Fronts>("fronts.json")]);
  return { manifest, timeseries, fronts };
}

/**
 * Plain-language problems with the files, empty when they match the contract. Shown on screen instead of a crash,
 * so whoever runs the pipeline sees exactly what to fix.
 */
export function checkData(m: Manifest, ts: TimeSeries, fr: Fronts): string[] {
  const out: string[] = [];
  const isDay = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!Array.isArray(m.bbox) || m.bbox.length !== 4 || !(m.bbox[0] < m.bbox[2] && m.bbox[1] < m.bbox[3])) out.push("manifest.bbox must be [lon min, lat min, lon max, lat max]");
  if (!(m.grid?.width > 0 && m.grid?.height > 0)) out.push("manifest.grid needs a positive width and height");
  if (!(m.speedMax > 0)) out.push("manifest.speedMax must be a positive number (the speed of PNG code 255)");
  if (!m.basemap?.src) out.push("manifest.basemap.src is missing");
  if (!m.passes?.length) out.push("manifest.passes is empty: at least one NISAR pass is needed");
  if (!m.pairs?.length) out.push("manifest.pairs is empty: at least one GOFF pair is needed for ice speed");
  if (!m.probes?.length) out.push("manifest.probes is empty: the charts need at least one probe point");
  else if (!m.probes.some((p) => p.id === "front")) out.push('manifest.probes needs one probe with id "front" (near the calving front); the headline numbers and alerts read it');
  m.passes?.forEach((p, i) => !isDay(p.date) && out.push(`manifest.passes[${i}].date should look like 2026-01-31, got ${JSON.stringify(p.date)}`));
  m.pairs?.forEach((p, i) => {
    if (!isDay(p.start) || !isDay(p.end)) out.push(`manifest.pairs[${i}] needs start and end dates like 2026-01-31`);
    if (!p.speed) out.push(`manifest.pairs[${i}].speed (the PNG path) is missing`);
  });
  if (ts.series?.length !== m.pairs?.length) out.push(`timeseries.series has ${ts.series?.length ?? 0} rows but manifest.pairs has ${m.pairs?.length ?? 0}; they must match one to one`);
  else ts.series.forEach((r, i) => (r.start !== m.pairs[i].start || r.end !== m.pairs[i].end) && out.push(`timeseries.series[${i}] is ${r.start}→${r.end} but pairs[${i}] is ${m.pairs[i].start}→${m.pairs[i].end}`));
  if (!Array.isArray(fr.flowline) || fr.flowline.length < 2) out.push("fronts.flowline needs at least two [lon, lat] points");
  fr.fronts?.forEach((f, i) => {
    if (!isDay(f.date)) out.push(`fronts.fronts[${i}].date should look like 2026-01-31`);
    if (typeof f.advanceKm !== "number") out.push(`fronts.fronts[${i}].advanceKm must be a number`);
    if (!Array.isArray(f.line) || f.line.length < 2) out.push(`fronts.fronts[${i}].line needs at least two [lon, lat] points`);
  });
  return out;
}

/** Index of the date in `dates` (ISO days) closest to `target`. Speed pairs and front picks come from different products, so their dates need not line up. */
export function nearestIndex(dates: string[], target: string) {
  const t = Date.parse(target);
  let best = 0;
  dates.forEach((d, i) => Math.abs(Date.parse(d) - t) < Math.abs(Date.parse(dates[best]) - t) && (best = i));
  return best;
}

export const directionLabel = (d: string) => (d === "A" ? "Ascending" : d === "D" ? "Descending" : "Unknown");

/** lon/lat -> grid pixel (fractional), for SVG overlays drawn in grid units. */
export const toGrid = (m: Manifest, lon: number, lat: number): [number, number] => [
  ((lon - m.bbox[0]) / (m.bbox[2] - m.bbox[0])) * m.grid.width,
  ((m.bbox[3] - lat) / (m.bbox[3] - m.bbox[1])) * m.grid.height,
];
export const toLonLat = (m: Manifest, x: number, y: number): [number, number] => [
  m.bbox[0] + (x / m.grid.width) * (m.bbox[2] - m.bbox[0]),
  m.bbox[3] - (y / m.grid.height) * (m.bbox[3] - m.bbox[1]),
];

export const midDate = (p: { start: string; end: string }) => new Date((Date.parse(p.start) + Date.parse(p.end)) / 2);
export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDayShort = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Sequential single-hue ramp (dark navy -> ice white) for speed; alpha rises with speed so slow ice stays see-through.
const STOPS: [number, [number, number, number]][] = [
  [0, [11, 33, 64]],
  [0.25, [22, 69, 127]],
  [0.5, [57, 135, 229]],
  [0.75, [140, 196, 255]],
  [1, [238, 247, 255]],
];
export function rampColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (x - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export const RAMP_CSS = `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(" ")}) ${t * 100}%`).join(", ")})`;
export const SERIES_COLORS: Record<string, string> = { front: "#3987e5", upstream: "#d95926" }; // validated dark pair

// ---------------------------------------------------------------- derived views of the data

export type SpeedUnit = "mday" | "kmyr";
export const UNIT_LABEL: Record<SpeedUnit, string> = { mday: "m/day", kmyr: "km/yr" };
/** m/day -> the chosen unit (1 m/day = 0.365 km/yr). */
export const toUnit = (v: number, u: SpeedUnit) => (u === "kmyr" ? v * 0.365 : v);

/** Centred 3-point mean; ends and gaps keep their own value. */
export function smooth3(vals: (number | null)[]) {
  return vals.map((v, i) => {
    const w = [vals[i - 1], v, vals[i + 1]].filter((x): x is number => typeof x === "number");
    return v === null || w.length < 3 ? v : (w[0] + w[1] + w[2]) / 3;
  });
}

export const season = (iso: string) => {
  const m = new Date(iso).getUTCMonth();
  return m <= 1 || m === 11 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Autumn";
};

export type Alert = { id: string; date: string; kind: "speed-up" | "slow-down" | "retreat" | "peak"; title: string; detail: string; pairIndex: number };
const SPEED_JUMP = 0.1; // 10% change in front speed between consecutive pairs
const RETREAT_KM = 0.4; // front retreat between consecutive passes

/** Alerts derived from the data itself, newest first. Thresholds are deliberately simple and listed above. */
export function deriveAlerts(ts: TimeSeries, fr: Fronts): Alert[] {
  const out: Alert[] = [];
  let peak = { v: -Infinity, i: -1 };
  ts.series.forEach((r, i) => {
    const v = r.front;
    if (typeof v === "number" && v > peak.v) peak = { v, i };
    const p = ts.series[i - 1]?.front;
    if (typeof v !== "number" || typeof p !== "number") return;
    const ch = (v - p) / p;
    if (Math.abs(ch) >= SPEED_JUMP)
      out.push({
        id: `s-${r.start}`,
        date: r.end as string,
        kind: ch > 0 ? "speed-up" : "slow-down",
        title: `Front speed ${ch > 0 ? "up" : "down"} ${Math.abs(ch * 100).toFixed(0)}%`,
        detail: `${p.toFixed(1)} → ${v.toFixed(1)} m/day near the front, ${fmtDayShort(r.start as string)} to ${fmtDayShort(r.end as string)}.`,
        pairIndex: i,
      });
  });
  fr.fronts.forEach((f, i) => {
    const prev = fr.fronts[i - 1];
    if (!prev) return;
    const d = f.advanceKm - prev.advanceKm;
    if (d <= -RETREAT_KM)
      out.push({
        id: `f-${f.date}`,
        date: f.date,
        kind: "retreat",
        title: `Front retreated ${Math.abs(d).toFixed(1)} km`,
        detail: `Between the passes on ${fmtDayShort(prev.date)} and ${fmtDayShort(f.date)}.`,
        pairIndex: nearestIndex(ts.series.map((r) => r.end as string), f.date),
      });
  });
  if (peak.i >= 0)
    out.push({
      id: "peak",
      date: ts.series[peak.i].end as string,
      kind: "peak",
      title: `Fastest pair in the record: ${peak.v.toFixed(1)} m/day`,
      detail: `Near the front, ${fmtDayShort(ts.series[peak.i].start as string)} to ${fmtDayShort(ts.series[peak.i].end as string)}.`,
      pairIndex: peak.i,
    });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
export const ALERT_RULES = { speedJumpPct: SPEED_JUMP * 100, retreatKm: RETREAT_KM };

/** CSV of the time series in the chosen unit. */
export function toCsv(m: Manifest, ts: TimeSeries, fr: Fronts, u: SpeedUnit) {
  const head = ["pair_start", "pair_end", "days", ...m.probes.map((p) => `${p.id}_speed_${UNIT_LABEL[u].replace("/", "_per_")}`), "front_advance_km_at_end", "sample"];
  const rows = ts.series.map((r, i) => {
    const f = fr.fronts.find((x) => x.date === r.end);
    return [r.start, r.end, m.pairs[i]?.days ?? "", ...m.probes.map((p) => (typeof r[p.id] === "number" ? toUnit(r[p.id] as number, u).toFixed(2) : "")), f ? (f.advanceKm - fr.fronts[0].advanceKm).toFixed(2) : "", m.sample];
  });
  return [head, ...rows].map((r) => r.join(",")).join("\n");
}
