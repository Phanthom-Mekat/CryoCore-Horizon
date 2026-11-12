// Rainfall context for the Chattogram case (IMPLEMENTATION_PLAN.md, F13): daily precipitation at Chattogram city from
// the NASA POWER Daily API, saved to public/data/chattogram/rain.json so the pages never depend on a live request.
// Contextual evidence only: modelled reanalysis precipitation on a coarse grid, not a rain-gauge or GPM IMERG record.
// The file format is source-agnostic, so a GPM IMERG series (needs an Earthdata login) can replace it later.
// Run: pnpm fetch-rain
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FOCUS } from "../src/lib/chattogram/frozen.ts";
import type { RainSeries } from "../src/lib/chattogram/rain.ts";

const START = "2026-06-01"; // two weeks before the first NISAR pass over the city (18 Jun 2026)
const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10); // POWER has nothing for today yet
const [lon, lat] = FOCUS.lonLat;
const url =
  `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG` +
  `&longitude=${lon}&latitude=${lat}&start=${START.replaceAll("-", "")}&end=${end.replaceAll("-", "")}&format=JSON`;

const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
if (!r.ok) throw new Error(`NASA POWER answered HTTP ${r.status}`);
const d = (await r.json()) as {
  header: { api: { version: string }; sources: string[]; fill_value: number; time_standard: string };
  parameters: { PRECTOTCORR: { units: string; longname: string } };
  properties: { parameter: { PRECTOTCORR: Record<string, number> } };
};
const values = d.properties.parameter.PRECTOTCORR;
const days = Object.keys(values)
  .sort()
  .map((k) => ({ date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`, mm: values[k] === d.header.fill_value ? null : values[k] }));

const out: RainSeries = {
  title: "Daily precipitation at Chattogram city",
  provider: "NASA POWER (Prediction Of Worldwide Energy Resources), Daily API",
  apiVersion: d.header.api.version,
  parameter: "PRECTOTCORR",
  longname: d.parameters.PRECTOTCORR.longname,
  units: d.parameters.PRECTOTCORR.units,
  sources: d.header.sources, // e.g. MERRA2, GEOSIT: NASA GMAO reanalysis / analysis
  kind: "modelled",
  resolution: "MERRA-2 grid, 0.5° × 0.625° (about 55 × 65 km)",
  timeStandard: d.header.time_standard, // LST: days are local solar days, NISAR times are UTC
  point: { name: FOCUS.name, lon, lat },
  retrievedAt: new Date().toISOString(),
  url,
  days,
};
const dir = fileURLToPath(new URL("../public/data/chattogram/", import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}rain.json`, JSON.stringify(out));
const filled = days.filter((x) => x.mm !== null);
console.log(
  `wrote public/data/chattogram/rain.json: ${days.length} days ${days[0].date}…${days.at(-1)!.date}, ${filled.length} with values, ` +
    `sources ${out.sources.join("+")}, total ${filled.reduce((s, x) => s + x.mm!, 0).toFixed(0)} ${out.units.replace("/day", "")}`,
);
