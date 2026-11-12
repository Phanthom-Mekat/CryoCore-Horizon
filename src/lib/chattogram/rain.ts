// Rainfall context (plan F13): the saved series and the sums the pages show. Contextual evidence for interpreting radar
// change, never proof of a cause. Plain module, so the Node fetch script can import its type.
export type RainSeries = {
  title: string;
  provider: string;
  apiVersion: string;
  parameter: string;
  longname: string;
  units: string; // mm/day
  sources: string[];
  kind: "modelled" | "observed";
  resolution: string;
  timeStandard: string;
  point: { name: string; lon: number; lat: number };
  retrievedAt: string;
  url: string;
  days: { date: string; mm: number | null }[]; // null: not yet available
};

export const RAIN_URL = "/data/chattogram/rain.json";

export async function loadRain(): Promise<RainSeries | null> {
  try {
    const r = await fetch(RAIN_URL);
    return r.ok ? ((await r.json()) as RainSeries) : null;
  } catch {
    return null;
  }
}

/**
 * Total over the `n` days up to and including `day` (YYYY-MM-DD), with how many of those days had values.
 * NISAR passes over the city are around 12:26 UTC (18:26 local), so the pass day is mostly before the image.
 */
export function rainBefore(series: RainSeries, day: string, n: number) {
  const end = Date.parse(day);
  const window = series.days.filter((d) => {
    const t = Date.parse(d.date);
    return t <= end && t > end - n * 864e5;
  });
  const known = window.filter((d) => d.mm !== null);
  return { mm: known.reduce((s, d) => s + (d.mm ?? 0), 0), days: known.length, of: n };
}
