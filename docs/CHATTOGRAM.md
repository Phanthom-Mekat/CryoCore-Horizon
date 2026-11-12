# The Chattogram case in the frontend

One case study, one journey, in the dashboard shell (`src/components/dashboard/Shell.tsx`). The sidebar group
**Chattogram · NISAR** is tagged *Real data*. (The earlier Jakobshavn glacier sample dashboard was removed on 13 Nov 2026.)

| Page | Route | What it answers |
| --- | --- | --- |
| Overview | `/chattogram` | The question, the case in numbers, how to read it, and a comparison to start with |
| Explore map | `/chattogram/explore` | What NISAR saw on each pass: browse quicklooks on the map, the division outline, a date timeline with replay |
| Compare dates | `/chattogram/compare` | What changed between two passes of the same orbit, and whether the two dates are fair to compare |
| Evidence & brief | `/chattogram/evidence` | Where every picture comes from, what is measured vs interpreted, and an exportable brief (JSON, CSV, GeoJSON, print) |
| Scene catalogue | `/chattogram/catalogue` | Every stored scene over the division, NASA discovery search, and a link to open any scene on the map |
| About & sources | `/chattogram/about` | Sources, licences, limitations, and legends |
| Calibrated radar | `/chattogram/processed` | Real HH/HV pilot, synchronized comparison, signed dB change, 3D terrain context, coverage and downloads |

## Data flow

The browser only talks to the Next.js app. Server routes proxy the backend (`src/lib/backend-proxy.ts`):

- `/api/earth/explorer` → `GET /api/v1/explorer`: division boundary with provenance, intersecting footprints, counts.
- `/api/earth/scenes` → `GET /api/v1/scenes`: full CMR metadata for each stored scene.
- `/api/earth/search` → `POST /api/v1/nasa/search`: NASA discovery from the catalogue page.
- `/api/nisar-browse`: fetches a scene's NISAR browse quicklook from ASF by granule ID (never a raw URL), makes its
  declared no-data transparent, and returns its corners: from ASF's public KML, or for provisional products derived
  from the image's valid-data extent and the CMR footprint (checked against a public KML to about one pixel).

`CaseProvider` loads the first two once for every page, keeps only scenes that intersect the division polygon, groups
them into stacks (same track, frame and direction), and keeps the selection (stack, before/after dates, map view,
selected scene) in the URL, so every view can be shared as a link.

## Export measured radar evidence

Open **Observation brief** from the calibrated radar page. The stable route
`/chattogram/processed/{caseId}/brief` renders the backend's case-specific report,
including an HH/HV distribution chart, full coverage/exclusion table, method,
source revisions and limitations. JSON and CSV retain published precision;
the display rounds numbers for readability. Print / save PDF uses the browser's
print dialog and a paper stylesheet. The report is explicitly in English.

The browse brief's selected dates are independent of the processed pilot. Never
attach pilot measurements to an arbitrary browse pair. The Live/Frozen catalogue
switch is hidden on processed pages; these read the backend's published bundle.

## Analyse a selected area

Choose **Area analysis** in the calibrated map's evidence panel. Click two
opposite corners, or pan and use the map-centre button for each corner. The
selection snaps to the native pixel grid and clips to available data; the amber
outline shows the rectangle actually measured. A third click starts a new area.
Area mode starts in 2D for consistent selection.

HH/HV tables show date medians and median pixel change on common-valid pixels,
with valid and excluded area and a change histogram. Median pixel change is not
necessarily the difference of date medians. Empty measurements stay null; HH/HV
areas overlap. JSON and GeoJSON exports include provenance and caveats. These
are exploratory measurements, not detected floods or validated findings.
Area selections are not yet included in snapshot links or the printable report.

## Share a processed view

**Share radar view** creates a snapshot link with the published case ID, layer,
polarization, opacity, comparison reveal, map centre/zoom and selected pixel.
It copies the URL when clipboard access is available and also exposes a selectable
field. Share again after changing controls; the previous link remains a snapshot.
Recipients need the same published case served by their backend. Localhost links
refer to the recipient's own development server.

Shared views open in 2D; terrain, camera tilt and bearing are not recorded.
Invalid controls fall back to safe defaults. An invalid or unavailable case ID
shows an error rather than opening another case. Pixel coordinates retain full
precision. `pnpm test` (or `node --experimental-strip-types --test tests/processed-state.test.mjs` alone) checks
parsing, precision and round-trip restoration.

## Inspect a native radar pixel

On `/chattogram/processed`, click the map or use **Inspect map centre** after
keyboard panning. A pin marks the requested location; the evidence panel shows
both HH and HV before/after/change values from the containing native pixel.
**Save pixel evidence** exports the response with method, source revisions and
asset hashes. The Next.js sample proxy forwards validated coordinates to
`GET /api/v1/cases/{id}/sample` without exposing credentials.

Excluded and outside-window locations are explicit. Missing values are never
shown as zero change, and numbers can exceed the colour legend's display range.
The panel uses the shared light/dark theme. Pixel evidence does not establish
flooding or replace independent validation.

## Honesty rules the UI follows

- Quicklooks are labelled as browse images, never as calibrated backscatter.
- Before two dates are compared, their geometry, polarizations, data maturity (from the CMR collection name) and product
  version are checked, and any difference is shown. The default pair is the widest-spaced one that passes all four.
- Until the processing worker publishes results, every difference is called observed radar change, not water change.
- Evidence shows the calibrated pilot's numbers (and the brief JSON's `calibrated_pilot`) as measured only when the
  compared dates are exactly the pilot's; for any other pair it says the pilot covers different dates.

## Frozen case (replay without the backend)

Plan F09. `pnpm freeze-case` (`scripts/freeze-case.mts`) reads the stored catalogue from the running backend and writes
`public/data/chattogram/case/`:

- `case.json`, version 1: capture time, generator, the display processing settings, sources, the backend's division
  view (boundary with provenance, footprints, counts), every scene that intersects the division, and the stacks frozen.
- `img/<granule>.webp`: the processed quicklook for every date in the stacks over Chattogram city (3 stacks, 29 dates
  at the first capture), each with its SHA-256, size, corners, and whether the corners came from ASF's KML or the
  CMR footprint. The images are made by `src/lib/chattogram/browse.ts`, the same code as the live proxy.
- `pilot/`: the calibrated pilot as the backend published it: the 8 GeoTIFFs (each checked against the manifest's
  SHA-256 while freezing) and the 6 dB display PNGs the map draws. `case.json` holds the pilot manifest, the layer
  corners and every file's SHA-256 under `pilot`; snapshots taken before the pilot existed have none.
- `curated/`: the curated `karnaphuli-estuary` case once the backend has published it from real files (never a
  synthetic QA bundle): the 3 layer PNGs and the JSON/CSV/GeoJSON exports. `case.json` holds its detail, layers,
  findings with per-finding evidence and timeseries under `curated`, with every file's SHA-256.

How the pages use it (`CaseProvider`):

| Situation | What loads | What the page says |
| --- | --- | --- |
| Backend up | Live catalogue; quicklooks from the frozen files where they exist, the proxy otherwise | Nothing extra; the brief records the snapshot date |
| Backend down | The frozen case | “Frozen case, captured …” on every page, with *Try live data* |
| `?source=frozen`, or `NEXT_PUBLIC_CASE_SOURCE=frozen` | The frozen case, with no backend, NASA or ASF request at all | Same notice, with *Switch to live data* |

The header of every case page has a **Live | Frozen · <date>** switch: it changes source instantly, without a
reload, keeping the chosen stack, dates and map view (it writes `?source=live` or `?source=frozen`). It hides itself
when there is no choice: no snapshot shipped, or the backend is down so the snapshot is all there is.

While replaying, the calibrated pilot comes from `pilot/` (Overview, Evidence, the brief and Calibrated radar; pixel
inspection is off, because it reads the rasters on the backend), NASA search in the catalogue is off, a scene outside the frozen stacks shows its footprint with a note
instead of fetching its image, and Evidence offers **Copy replay link**: the same dates and map view, opened from the
snapshot. The brief's JSON records `data_source`, `replay_url` and each quicklook's checksum.

## Rainfall context

Plan F13. Explore and Compare show daily rainfall at Chattogram city with the NISAR pass dates marked; Compare adds
the rain in the 7 days up to each compared date, Evidence lists it per acquisition and the brief JSON carries it as
`rainfall_context`.

- Source: NASA POWER Daily API, `PRECTOTCORR`. It is **modelled** reanalysis (MERRA-2 / GEOS-IT, about 55 × 65 km),
  not a rain gauge or GPM IMERG; the pages say so. Days are local solar days; NISAR passes over the city are around
  12:26 UTC (18:26 local), so the pass day's rain mostly fell before the image.
- `pnpm fetch-rain` (`scripts/fetch-rain.mts`) writes `public/data/chattogram/rain.json`. The pages read only that
  file, so the chart also works when replaying the frozen case. Run it again before recording to extend the series.
- Context, not cause: rain is one reason radar brightness changes; tide, wind and crops are others. The pages never
  attribute a change to rain.
- To use GPM IMERG instead, write the same `RainSeries` shape (`src/lib/chattogram/rain.ts`) with `kind: "observed"`.

## Languages: English and বাংলা

Plan F15. The **EN | বাংলা** switch in the header changes the whole case journey (Overview, Explore map, Compare,
Evidence, About, Calibrated radar), the sidebar, the frozen-case notice, map labels and legends.

- All text lives in `src/lib/i18n/messages.ts`. `bn` is typed as the English `Messages`, so the build fails if any
  Bangla entry is missing; another language is one more object there.
- Components read text with `useT()` and format dates and numbers with `src/lib/i18n/format.ts` (`bn-BD`: Bengali
  digits and month names; times stay UTC).
- The choice is kept in this browser (`localStorage`) and applied to `<html lang>` before the page paints, so screen
  readers switch voice and nothing flickers. Bengali text uses Noto Sans/Serif Bengali, downloaded only when needed.
- Mission, product and unit names stay as published (NISAR, GCOV, NASA, ASF, HH/HV, dB, γ⁰, SHA-256).
- Map place names: in English the basemap's labels; in Bangla our landmark labels instead, drawn as HTML because the
  map's WebGL text can't shape Bengali conjuncts.
- A translation guard keeps it that way: `tests/i18n-guard.test.mjs` lists the components that are fully translated,
  and `pnpm test` fails, naming the file and line, if one of them shows English text instead of a message. Published
  names are allowed; the one list of them is `PUBLISHED` in `tests/support/hardcoded-text.mjs`. Other English kept on
  purpose (source citations, technical error details, proper names) goes inside an element marked
  `lang="en" translate="no"`. A plain `lang="en"` only tells screen readers the language, so untranslated text marked
  that way still fails. Translate a component, then add it to the list.
- Text the backend writes in English (a case title, the analysis area's provenance) shows in Bangla when
  `messages.ts` has a translation for that value, and otherwise as sent, inside `lang="en"`: never blank.
- Still English on purpose: the downloaded brief (JSON, CSV, GeoJSON: data files whose field names must stay
  stable), identifiers, and technical error details. Not yet translated: the Scene catalogue, the Jakobshavn sample
  pages and the landing page.
