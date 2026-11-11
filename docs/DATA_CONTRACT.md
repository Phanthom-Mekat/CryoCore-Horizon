# Dashboard data contract

What the backend hands the frontend. Drop these files into `public/data/jakobshavn/` and reload `/dashboard`; no rebuild is needed in `npm run dev`. If anything doesn't match, the dashboard lists every problem on screen instead of crashing (see `checkData` in `src/lib/dashboard-data.ts`, the source of truth for the types).

`scripts/nisar_pipeline.py build` already writes all of this. This page is for anyone producing the files another way (a notebook, a different glacier, extra products).

```
public/data/jakobshavn/
  manifest.json             what exists: passes, speed pairs, probes, map extent
  timeseries.json           probe speeds, one row per speed pair
  fronts.json               calving front per radar pass
  basemap.webp              optical backdrop covering bbox
  speed/<start>_<end>.png   one ice-speed grid per pair
  radar/<date>.webp         one radar preview per pass (optional per pass)
```

Dates are ISO days (`2026-01-31`). Coordinates are `[lon, lat]` in EPSG:4326. Speeds are metres per day.

## manifest.json

| Field | Type | Notes |
|---|---|---|
| `sample` | boolean | `false` for real data. `true` shows the "Sample data" banner everywhere. |
| `maturity` | string, optional | NISAR data maturity of the products: `BETA`, `PROVISIONAL` or `VALIDATED`. Shown beside the data status. Don't mix levels in one record. |
| `note` | string, optional | Shown on Data and methods while `sample` is true. |
| `glacier` | string | Display name. |
| `bbox` | `[lonMin, latMin, lonMax, latMax]` | Extent of the basemap, speed grids and radar previews. All rasters must cover exactly this box, north up, linear in lon/lat. |
| `basemap` | `{ src, caption }` | `src` is relative to the folder. `caption` is the credit line under the map. |
| `grid` | `{ width, height }` | Pixel size of every speed PNG. |
| `speedMax` | number | Speed (m/day) that PNG code 255 stands for. |
| `units` | `"m/day"` | |
| `passes` | `Pass[]` | Every acquisition, oldest first. |
| `pairs` | `Pair[]` | Every speed pair, oldest first. |
| `probes` | `Probe[]` | Points the charts follow. Keep the ids `front` (near the calving front; drives the headline numbers and alerts) and `upstream`. Extra probes are charted too. |

```ts
Pass  = { date, direction: "A" | "D" | "?", track: number | null, frame: number | null, radar: string | null }
Pair  = { start, end, days, speed }       // speed = "speed/<start>_<end>.png"
Probe = { id, label, lon, lat }           // id is the column name in timeseries.json
```

Pairs and fronts **don't** need to share dates. Speed pairs come from GOFF and fronts from GCOV; the dashboard matches them to the nearest date.

## Speed PNGs

8-bit grey + alpha (`LA`), `grid.width × grid.height`.
- Grey: `speed = grey / 255 × speedMax`.
- Alpha: `0` means no valid measurement (low SNR, water, outside swath); anything above 0 is valid.

## Radar previews

Greyscale WebP covering `bbox`, any size (the pipeline uses 1000 × 375). The pipeline maps −25…0 dB γ⁰ HH to 0…255; keep one stretch for every date so before/after and Difference compare fairly.

## timeseries.json

```json
{ "sample": false, "units": "m/day",
  "series": [ { "start": "2025-11-07", "end": "2025-11-19", "front": 21.8, "upstream": 8.4 } ] }
```
Exactly one row per `manifest.pairs` entry, same order, same `start`/`end`. One key per probe `id`; `null` when the probe had no valid pixels.

## fronts.json

```json
{ "sample": false,
  "flowline": [[-49.80, 69.153], [-49.58, 69.154]],
  "fronts": [ { "date": "2025-11-07", "advanceKm": 0, "line": [[-49.79, 69.12], [-49.79, 69.18]] } ] }
```
- `flowline`: centre line of the glacier, front to inland.
- `advanceKm`: position along the flowline; larger means further seaward. The dashboard shows it relative to the first front.
- `line`: the front drawn on the map, at least two points.

## Checklist before handing over

- [ ] `sample` is `false`, and `maturity` is set
- [ ] `timeseries.series` rows match `manifest.pairs` one to one
- [ ] every `pairs[].speed` and `passes[].radar` file exists
- [ ] all rasters cover exactly `bbox`
- [ ] open `/dashboard`: no red problem list, no "Sample data" banner
