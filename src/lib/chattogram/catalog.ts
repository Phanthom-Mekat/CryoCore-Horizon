import catalog from "@/data/chattogram/catalog.json";

/** One NISAR L2 GCOV granule from the frozen CMR snapshot (scripts/fetch-chattogram.mjs). */
export type Pass = {
  id: string;
  granule: string;
  collection: string;
  maturity: "provisional" | "beta" | "standard";
  start: string;
  end: string;
  stack: string;
  track: number;
  frame: number;
  direction: "ascending" | "descending";
  cycle: number;
  polA: string | null;
  polB: string | null;
  bandwidth: string | null;
  version: string | null;
  fullFrame: boolean;
  footprint: [number, number][];
  links: { data: string | null; qa: string | null; browse: string | null };
  browse: { src: string; quad: [number, number][] } | null;
  optical: { src: string; date: string; layer: string } | null;
};
export type CasePass = Pass & { browse: NonNullable<Pass["browse"]>; optical: NonNullable<Pass["optical"]> };

export const CATALOG = catalog as unknown as {
  retrievedAt: string;
  source: string;
  bbox: [number, number, number, number];
  caseStack: string;
  collections: { id: string; shortName: string }[];
  passes: Pass[];
};
export const PASSES = CATALOG.passes;
/** The case-study stack in time order: same track, frame and radar mode, so any two dates compare fairly. */
export const CASE = PASSES.filter((p): p is CasePass => p.stack === CATALOG.caseStack && !!p.browse && !!p.optical).sort((a, b) =>
  a.start.localeCompare(b.start)
);
export const STACKS = [...new Set(PASSES.map((p) => p.stack))].sort();
export const TRACKS = [...new Set(PASSES.map((p) => p.track))].sort((a, b) => a - b);

export const PLACES = [
  { name: "Chattogram", lon: 91.83, lat: 22.34 },
  { name: "Feni", lon: 91.4, lat: 23.01 },
  { name: "Sandwip", lon: 91.45, lat: 22.5 },
  { name: "Hatiya", lon: 91.1, lat: 22.3 },
  { name: "Cox's Bazar", lon: 91.98, lat: 21.43 },
] as const;

const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });
const fmtY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const fmtT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" });
/** Dates and times are shown in Bangladesh time (UTC+6), the local day of the pass. */
export const day = (iso: string) => fmt.format(new Date(iso));
export const dayYear = (iso: string) => fmtY.format(new Date(iso));
export const localTime = (iso: string) => fmtT.format(new Date(iso));

export const maturityLabel: Record<Pass["maturity"], string> = {
  provisional: "Provisional",
  beta: "Beta",
  standard: "Standard",
};
/** Human description of the radar mode, e.g. "HH+HV" with its bandwidth in MHz. */
export const mode = (p: Pass) => `${p.polA ?? "?"}${p.bandwidth ? `, ${p.bandwidth.split("+")[0]} MHz` : ""}`;
/** Gaps longer than the 12-day repeat, as [after, before] pairs, so the timeline can show missing passes. */
export function gaps(passes: Pass[], repeatDays = 12) {
  const out: [Pass, Pass][] = [];
  for (let i = 1; i < passes.length; i++)
    if (Date.parse(passes[i].start) - Date.parse(passes[i - 1].start) > (repeatDays + 2) * 864e5) out.push([passes[i - 1], passes[i]]);
  return out;
}
