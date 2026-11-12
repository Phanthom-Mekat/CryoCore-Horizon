# CryoCore Horizon: Chattogram implementation plan

Status (13 Nov 2026): discovery catalogue and the frontend case journey use real NISAR metadata and browse quicklooks; the case replays from a frozen snapshot without the backend (F09), in English and Bangla (F15), with NASA rainfall context (F13). A small backend pilot now produces calibrated HH/HV layers and signed radar change from real pixels; a dedicated processed Mapbox view is integrated, while terrain-quality checks and independent validation remain pending. See the progress tracker below.

Implementation update: the case lives at `/chattogram` (Overview, Explore map, Compare, Evidence, Scene catalogue, About; see [docs/CHATTOGRAM.md](docs/CHATTOGRAM.md)). The first discovery increment is its Scene catalogue.
It includes an attributed 2018 BBS/HDX reference boundary, real NASA catalog
footprints, polygon-intersection filtering, date selection, and source inspection.
See [feature notes](docs/EXPLORER.md). F01 remains incomplete for analysis use until
the boundary's current suitability and a smaller analysis polygon are verified;
F02 has an initial authenticated real-file metadata inspection; the candidate pair and pixel validity still need verification.
Prepared: 12 November 2026.

### Completed discovery increment

- [x] Serve catalog footprints, acquisition-day counts, and boundary provenance through the FastAPI explorer endpoint.
- [x] Filter actual scene polygons against the division polygon; report excluded and missing footprints separately.
- [x] Add reproducible boundary preparation, pinned source metadata, checksum, and license attribution.
- [x] Connect real NASA CMR search and pagination to the SQLite catalog through server-side frontend routes.
- [x] Build a Mapbox GL explorer with attributed geographic context, selectable scenes, date filtering, and source inspection.
- [x] Match the existing landing/dashboard aesthetic using the shared brand, dashboard shell, navigation, page header, KPI components, and color tokens.
- [x] Adopt pnpm with a committed lockfile and document frontend/backend setup and data limitations.
- [x] Pass 17 backend tests, the production frontend build, and TypeScript checking; inspect desktop and 390 px mobile layouts.

These completed tasks cover discovery, not processed radar imagery or validated
surface-change findings. F01/F02 and the scientific milestones remain incomplete.

### Completed frontend case increment

- [x] Merge the scene catalogue and the radar views into one case at `/chattogram` in the shared dashboard shell: Overview, Explore map, Compare dates, Evidence & brief, Scene catalogue, About & sources ([docs/CHATTOGRAM.md](docs/CHATTOGRAM.md)). `/explore` redirects to the catalogue.
- [x] Show real NISAR GCOV browse quicklooks on the map through a server proxy (granule IDs only, no raw URLs); georeference from ASF's KML, or for provisional products from the image's valid extent and the CMR footprint (checked to about one pixel against a public KML).
- [x] Group scenes into stacks (same track, frame, direction) over the division polygon; timeline of actual acquisition dates with replay and background prefetch.
- [x] Before/after reveal with synced maps, keyboard control and date badges; automatic compatibility check (geometry, polarizations, data maturity from the CMR collection, product version). Default pair: the widest-spaced fully compatible one.
- [x] Evidence page and observation brief: observed vs measured vs interpreted, full provenance (granule, CMR concept, collection, version, MD5, QA report), JSON/CSV/GeoJSON export and print.
- [x] Selection (stack, dates, map view, selected scene) kept in the URL so views can be shared; catalogue scenes open directly on the radar map.
- [x] Legends and map layers ready for processed results: water-change candidates (cyan/amber with stripes) and signed dB change (separate diverging scale), colours checked with a CVD/contrast validator.
- [x] Lint, TypeScript and production build pass; all case pages checked at 1920×1080 and 390 px; backend-down and empty states tested.

### Completed replay increment (F09)

- [x] `pnpm freeze-case` (`scripts/freeze-case.mts`) writes a versioned snapshot to `public/data/chattogram/case/`: `case.json` (capture time, generator, display processing settings, sources, the backend's division view, all 125 intersecting scenes, the frozen stacks) and 29 processed quicklooks for the 3 stacks over Chattogram city, each with SHA-256, size, corners and corner method.
- [x] Live proxy and freeze script share one implementation (`src/lib/chattogram/browse.ts`), so replayed images are processed exactly like live ones.
- [x] The case pages use the snapshot automatically when the backend is unreachable, on purpose with `?source=frozen`, or for a whole deployment with `NEXT_PUBLIC_CASE_SOURCE=frozen`; every page then says “Frozen case, captured …” with a way back to live data.
- [x] Replay makes no live request: tested with the backend stopped and `?source=frozen` across all six case pages — 0 requests to the backend, the image proxy, ASF or CMR, and no console errors.
- [x] Evidence offers **Copy replay link** (same dates and map view from the snapshot); the brief records `data_source`, `replay_url` and each quicklook's checksum. NASA search is disabled while replaying.
- [x] Live mode also serves quicklooks from the snapshot where it has them: 3 ms per image instead of 7.8 s through the proxy on a cold cache.
- [x] **Live | Frozen** switch in the header of the case pages: changes source without a reload and keeps the selection; hidden when there is no snapshot or the backend is down. Checked by mouse and keyboard, in both languages and at 390 px.

### Completed Bangla increment (F15)

- [x] Translation-ready text: every string of the case journey in `src/lib/i18n/messages.ts`; the Bangla object is type-checked against the English one, so a missing translation fails the build.
- [x] Curated Bangla copy for Overview, Explore map, Compare, Evidence, About, the sidebar, the frozen-case notice, map notes, timeline and legends; mission, product and unit names kept as published.
- [x] **EN | বাংলা** switch in the header, remembered per browser and applied to `<html lang>` before paint (no flash; screen readers switch voice); works by keyboard.
- [x] Bengali dates and digits (`bn-BD`), Noto Sans/Serif Bengali loaded only for Bengali text, no letter-spacing or uppercase on Bengali labels.
- [x] Map place names shaped correctly: Bangla landmark labels as HTML (WebGL map text can't shape Bengali), with the basemap's English place labels hidden in Bangla, so names never overlap.
- [x] Checked in a browser: no untranslated English left on the five case pages (only the kept technical names), all six case pages fit 390 px in both languages, no console errors.

### Completed rainfall increment (F13)

- [x] Source checked before use: GPM IMERG needs an Earthdata login, so this increment uses the **NASA POWER Daily API** (no login), parameter `PRECTOTCORR`, which is modelled reanalysis precipitation (MERRA-2 / GEOS-IT) on a 0.5° × 0.625° grid. Labelled as modelled on every page; the file format is source-agnostic so an IMERG series can replace it.
- [x] `pnpm fetch-rain` (`scripts/fetch-rain.mts`) saves the series at Chattogram city to `public/data/chattogram/rain.json` (1 Jun 2026 → yesterday) with provider, API version, sources, resolution, day boundaries (local solar time), retrieval time and the request URL. The pages read only this file, so the chart works in frozen mode and offline.
- [x] Rainfall card on **Explore** (the stack's season with every NISAR pass marked, Before and After emphasised) and on **Compare** (the weeks around the pair, with the rain in the 7 days up to each date: 389 mm before 7 Jul, 8 mm before 11 Oct 2026).
- [x] One-hue bar chart on a true time axis, hover readout, a “Show the numbers” table for screen readers, scrolls sideways on phones instead of shrinking; English and Bangla.
- [x] Shown as context, never cause: a caveat under every chart; Evidence lists the 7-day rain per acquisition and the brief JSON carries `rainfall_context` with its full source.
- [x] Checked in a browser: Explore and Compare in both languages, 1440 px and 390 px (no page overflow), frozen mode (0 backend/proxy requests), no new console errors.

### Progress tracker

Updated 13 November 2026. "Partial" includes implemented pilots with remaining scientific validation or broader product work.

| ID | Feature | Status | Done | Still needed |
| --- | --- | --- | --- | --- |
| F01 | Verified study area | Partial | 2018 BBS/HDX boundary with provenance; scenes filtered by the polygon; drawn on every map | Confirm current suitability; add the smaller analysis polygon |
| F02 | Real NISAR case selection | Partial | Real July/October HDF5 metadata inspected; frequency-A metadata gate passes; frequency B blocked on exception-mask dimensions; case-selection notes recorded | Gate A: validate mixed-mode implications, subset, valid common pixels and reference observations |
| F03 | Reliable data preparation | Partial | Authenticated inspection and resumable download CLI; durable checkpoints/states; ETag/MD5 verification and SHA-256 provenance; atomic file publication; read-only progress API | Full NASA assets still partial; automatic worker queue, cancellation/retry policy and preparation UI |
| F04 | Processed radar layers | Partial | Real frequency-A HH/HV GeoTIFF pilot; documented masks, common grid, hashes, downloads and georeferenced Mapbox overlays with fixed scales | Static terrain quality, mixed-mode review, larger-area tiling |
| F05 | Defensible change map | Partial | Signed after-minus-before dB change over common valid pilot pixels; coverage/exclusion statistics | Confounder assessment, independent validation and frontend map; no water classification yet |
| F06 | Before/after comparison | Complete for pilot | Calibrated HH/HV comparison, keyboard slider, synchronized maps, date badges and common −25..0 dB display scale at `/chattogram/processed` | Extend to additional validated acquisitions |
| F07 | Click-to-explain evidence | Partial | Evidence page with sources, checks, limitations | `/cases/{id}/findings` polygons to click; local statistics |
| F08 | Chattogram overview | Partial | Overview page with real catalogue numbers and a featured comparison | Observed area, eligible comparison area, change summaries |
| F09 | Reproducible case replay | Done for the current case | Versioned frozen case (manifest, 29 quicklooks with SHA-256), automatic fallback, `?source=frozen` replay link, honest labelling; zero live requests when replaying | Add processed layers, findings and the selected finding to the snapshot once they exist; refresh with `pnpm freeze-case` before recording |
| F10 | Validation and methods | Partial | Methods, limitations and claim level shown in About and Evidence | Reference data, evaluation samples, results |
| F11 | Timeline playback | Partial | Replay over actual dates, gaps visible | Per-date summaries and a synced chart from processed values |
| F12 | Local observation brief | Done for current evidence | JSON, CSV, GeoJSON, print; every value traced to NASA metadata | Add findings and statistics once they exist |
| F13 | NASA rainfall context | Done with a modelled series | NASA POWER daily rainfall (MERRA-2/GEOS-IT, modelled) saved as a static file; charts on Explore and Compare with NISAR passes marked; 7-day totals in Compare, Evidence and the brief; context-not-cause caveat | Swap in GPM IMERG (observed, 0.1°) once an Earthdata login is available to the frontend scripts; refresh with `pnpm fetch-rain` before recording |
| F14 | Community context | Not started | – | Licensed overlays |
| F15 | Local accessibility | Done for the core journey | English/Bangla case journey with a header switch, Bengali dates and fonts, `<html lang>`, keyboard use, colour plus pattern, 390 px in both languages | A native speaker's review of the Bangla text; translate the Scene catalogue, the landing page and the glacier sample if they stay in the demo |
| F16 | Terrain storytelling | Not started | – | P2 |
| F17 | Evidence-based narration | Not started | – | P2 |

### Completed preparation increment — 12 November 2026

- [x] Add ordered transactional SQLite migrations through schema v3, preserving previous inspection reports.
- [x] Add resumable operator downloads with durable byte checkpoints and OS locks preventing duplicate writers.
- [x] Verify catalog MD5 before atomic publication; record SHA-256 and recheck completed assets before reuse.
- [x] Test interrupted transfers, recovery of uncheckpointed bytes, duplicate locks, checksum failures and migration persistence.
- [x] Verify real NASA resume: October scene progressed from 4 MiB to 8 MiB on the second invocation.
- [x] Inspect both candidate HDF5 files and expose frequency-specific compatibility reasons through the read-only pair API.
- [x] Pass 32 backend tests and verify new endpoints against the already-running backend.
- [ ] Complete queued-worker lifecycle, processing and frontend preparation status (F03 remains partial).

- [x] Verify the configured Earthdata bearer token against a real NISAR HDF5 asset.
- [x] Inspect real file metadata within a bounded transfer budget; persist revision-specific reports without exposing credentials or signed URLs.
- [x] Verify scene `G4405731724-ASF`: 8,371,830,784-byte asset; 3,670,016 bytes fetched; frequency A 16,884 × 17,208 at 20 m; frequency B 4,221 × 4,302 at 80 m; EPSG:32646; mask datasets present. Pixel validity and full checksum remain unchecked.

### Completed calibrated-window increment — 12 November 2026

- [x] Extract real HH/HV power and documented frequency-A quality masks for both dates with bounded reads (9,699,328 bytes per source).
- [x] Generate eight georeferenced GeoTIFFs on the identical native 20 m grid: before/after HH/HV, signed HH/HV change and two common-valid masks.
- [x] Preserve no-data and reject zero valid coverage; report inside/outside ROI and date-specific/common coverage.
- [x] Publish an atomic case bundle with source IDs, revisions, ETags, method, mask definitions, asset hashes and limitations.
- [x] Add read-only case list/detail and asset-download endpoints; verify against the running server.
- [x] Pass 37 backend tests and verify all eight real GeoTIFF hashes, CRS, grids, common counts and numeric delta values.
- [x] Integrate the processed pilot into the frontend with consistent contrast, coverage display and evidence labels.

Pilot `6573c8bc5837ede3c0541563`: 21.8152 km² retained/common-valid area;
4.3992 km² excluded by boundary/footprint clipping. River-corridor clipping means
this pilot cannot demonstrate river-water change. See `docs/case-selection.md`.

### Completed Mapbox pilot interface — 13 November 2026

- [x] Add `/chattogram/processed` in the shared light/dark dashboard aesthetic, linked from navigation, Explore and Compare.
- [x] Render georeferenced, transparent Web Mercator previews from calibrated GeoTIFFs; keep raw downloads available.
- [x] Add HH/HV, before/after, keyboard swipe, signed-change and opacity controls with fixed scientific legends.
- [x] Add 2D analysis / 3D terrain controls with true-scale terrain, camera tilt, compass and theme-aware Mapbox Standard context. Comparison stays terrain-free for consistent geometry.
- [x] Show coverage, exclusions, median change, source provenance, caveats and evidence downloads.
- [x] Prevent stale layers from persisting during failed or pending date/layer changes; add bounded loading requests and explicit error/empty states.
- [x] Fix in-app development hydration by keeping React debug data in the RSC response instead of the separate dev WebSocket.
- [x] Verify desktop and 390 px mobile layouts, dark mode, 3D controls, polarization and keyboard slider in the in-app browser; confirm both production and development rendering.
- [x] Pass TypeScript, ESLint, production build and 38 backend tests.

### Next up

- **Backend:** resolve mixed-mode and static terrain quality; select a water-suitable ROI and dated reference evidence; complete queued-worker lifecycle and frozen replay assets.
- **Frontend:** add measured pixel inspection and findings once supported; extend processed comparisons to additional validated dates; connect pilot evidence to the observation brief; translate the Calibrated radar page into Bangla; swap the modelled rainfall for GPM IMERG when an Earthdata login is available; rework the landing page around the Chattogram case (needs a team decision).
- **Team:** make the GitHub repository public before submission, fill in the team names on the landing page, choose a repository licence.

Demo target: 240 seconds, as specified by the team. Verify the actual submission
duration, format, eligibility, and deadlines against the current event rules before recording.

## 1. Product direction

**Turn NASA-ISRO NISAR observations into an understandable story of surface change
in Chattogram Division, Bangladesh.**

Working presentation title: **CryoCore Horizon — Chattogram, Through the Clouds**.

Primary user: a local environmental analyst or community researcher reviewing
where surface-water conditions changed and where follow-up inspection is warranted.
Secondary users: educators, local planners, and residents exploring their area.

The core journey should take less than a minute:

1. Open a real, preprocessed Chattogram case study.
2. Scrub through acquisition dates and see where radar observations changed.
3. Compare the same location before and after.
4. Click a highlighted area to understand the observation, evidence, and limitations.
5. Export a short, traceable observation brief for further investigation.

**Primary science story:** observed surface-water change in one small, well-covered
part of Chattogram Division. Start with a floodplain or estuarine area; select the
actual location and dates after inspecting usable NISAR acquisitions. Do not choose
a dramatic disaster story first and then force the observations to fit it.

Candidate areas to investigate, not confirmed case studies: the Feni–Muhuri area,
Karnaphuli surroundings, or the lower Sangu corridor. Tidal influences, terrain,
and available reference evidence must inform selection. Keep the division-wide
map for orientation; the first scientific result can cover a much smaller area.

Fallback: if water-change interpretation cannot be supported, demonstrate
**observed radar backscatter change**, explain plausible drivers, and show what
additional evidence is needed. A truthful, complete case study is the release goal.

## 2. What makes this competitive

The published 2025 Space Apps judging guidance discusses impact, creativity,
validity, relevance, and presentation. Use these as planning lenses, not as a
verified 2026 scoring rubric. Winning cannot be guaranteed.

| Lens | Evidence we will demonstrate |
| --- | --- |
| Impact | A specific local question and a useful observation brief, reviewed by at least one potential user if available |
| Creativity | A synchronized map, timeline, and evidence view that turns a radar comparison into an understandable local story |
| Validity | Reproducible processing, quality masks, independent reference checks, and explicit uncertainty |
| Relevance | Actual NISAR-derived outputs drive the central experience; NASA data is essential to the result |
| Presentation | One continuous journey, legible visuals, a clear finding, and a rehearsed four-minute demonstration |

Do not optimize for the number of dashboards. Prioritize one impressive interaction
whose output is scientifically defensible and useful.

## 3. Starting point and scope

Already present:

- Next.js/React frontend, Three.js hero, dashboard shell, charts, and comparison UI.
- FastAPI backend, SQLite catalog, NASA CMR discovery, source metadata, and tests.
- Original Jakobshavn sample dashboard and glacier-specific Python pipeline.
- Chattogram discovery explorer with a versioned reference boundary, real catalog
  footprints, acquisition-date filtering, and source inspection.

Not yet present:

- Verification of the reference boundary's current suitability, authenticated
  NISAR downloads, processed rasters, change analysis, processed-case frontend
  integration, or validated local findings.

The existing NASA search demonstrates metadata discovery only. Catalog record
counts are not counts of usable temporal observations, validated changes, or full
division coverage. Existing glacier metrics must not appear in the Chattogram demo.

Priority definitions:

- **P0 — required:** complete these before investing in optional effects.
- **P1 — differentiator:** add after the core case study works end to end.
- **P2 — stretch:** add only after validation, performance, and video rehearsal pass.

## 4. Feature roadmap

| ID | Priority | Feature and user value | Backend work | Frontend experience | Acceptance condition |
| --- | --- | --- | --- | --- | --- |
| F01 | P0 | Verified study area | Store versioned division boundary plus a smaller analysis polygon; record source/license | Division outline, named study area, honest coverage overlay | Statistics are clipped to the analysis polygon; approximate catalog envelope is never labeled as an official boundary |
| F02 | P0 | Real NISAR case selection | Inspect product metadata, footprints, dates, polarization, maturity, and geometry; identify a compatible pair | Acquisition cards show actual dates, product, polarization, and coverage | At least two usable acquisitions share a defensible comparison area and compatible processing assumptions |
| F03 | P0 | Reliable data preparation | Earthdata-authenticated worker; resumable downloads; integrity checks; durable job states | Small preparation/status view with actionable errors | A failed job can retry safely; incomplete output is never served as completed data |
| F04 | P0 | Processed radar layers | Read verified GCOV layers, quality-mask, align grids, clip, generate display rasters/tiles and numeric assets | Clear radar layers with shared contrast scale and visible no-data regions | Layers align spatially; units and masks are correct; visual comparison does not use misleading independent stretching |
| F05 | P0 | Defensible change map | Compute documented backscatter difference; derive candidate water-change areas only if reference checks support it | New/retained/receded water candidates where justified, otherwise signed backscatter change | Every area value is reproducible; unsupported pixels are masked; interpretation matches evidence strength |
| F06 | P0 | Before/after comparison | Serve paired layers and comparison metadata | Large swipe divider, date badges, keyboard control, synchronized zoom | Same extent and scale on both sides; source, dates, units, and legend remain visible |
| F07 | P0 | Click-to-explain evidence | Return local statistics, quality flags, source IDs, parameters, and reference observations | Click a polygon to open “What changed / Why we think so / What is uncertain” | Every displayed finding links back to its source acquisitions and method version |
| F08 | P0 | Chattogram overview | Return observed area, eligible comparison area, change summaries, and observation dates | One map-led dashboard with three useful summary values | No synthetic figures, stale glacier labels, or implication of real-time monitoring |
| F09 | P0 | Reproducible case replay | Freeze a case manifest with immutable assets and versioned processing metadata | “Replay this case” opens the same dates, extent, and selected finding | Recorded demo works without a fresh NASA request or a new download |
| F10 | P0 | Validation and methods | Store reference sources, evaluation samples, limitations, and validation results | Compact methods drawer and evidence quality labels | Numerical accuracy claims exist only when supported by a documented evaluation |
| F11 | P1 | Timeline playback | Prepare three or more comparable observations; per-date summaries | Scrubbable timeline, play/pause, synchronized chart and map | Playback uses actual acquisition dates; gaps remain visible; no interpolation presented as observed data |
| F12 | P1 | Local observation brief | Export summary JSON/CSV/GeoJSON plus provenance | Print-friendly one-page brief with map, dates, findings, caveats, and attribution | Exported values match the map and can be traced to the selected case |
| F13 | P1 | NASA rainfall context | Add a documented NASA GPM/IMERG series only after verifying access, product, resolution, and units | Small rainfall chart aligned with NISAR dates | Mark as contextual evidence; temporal association is not presented as proof of causation |
| F14 | P1 | Community context | Optional licensed settlement/road/land-use overlays with dates and coverage | Named places and clearly labeled overlap summaries | No “people affected,” damage, or closed-road claims inferred solely from map intersections |
| F15 | P1 | Local accessibility | Translation-ready labels and curated Bangla copy | English/Bangla core journey, readable mobile layout, accessible controls | Essential flow is keyboard usable; color is not the only way to distinguish change |
| F16 | P2 | Terrain storytelling | Prepare suitable terrain assets with source attribution | Short Chattogram fly-in and optional 3D terrain view | Clearly illustrative camera movement; scientific review stays available in accurate 2D |
| F17 | P2 | Evidence-based narration | Deterministic finding templates using computed values | “Explain this observation” in plain language | All factual statements are derived from stored evidence; no invented causal explanations |

## 5. Science and NASA data gates

### Gate A — select a usable story before polishing it

- [x] Obtain a versioned reference administrative polygon and record provenance/license
  (2018 BBS/HDX boundary via pinned geoBoundaries source).
- [ ] Verify the reference boundary's current suitability for the selected analysis.
- [x] Choose a manageable analysis subset with actual overlapping NISAR coverage.
- [x] Inspect real files and record acquisition times, product versions, maturity,
  orbit/track, frequency, polarization, and relevant quality metadata.
- [ ] Confirm a compatible before/after pair; three or more dates unlock playback.
- [ ] Identify reference observations appropriate to those dates and the phenomenon.
- [x] Record file sizes and an achievable storage/processing budget before bulk downloads.
- [x] Write `case-selection.md` with chosen location/dates, rejected alternatives,
  known confounders, and the claim the data can support.

**Exit condition:** a real pair can be processed and compared. If this fails, change
the dates or subset, or use the backscatter-change fallback. Do not fabricate an event.

### Gate B — observation before interpretation

GCOV provides geocoded, terrain-corrected radar covariance/backscatter, with
available polarizations dependent on the acquisition. Confirm the actual file
layout and metadata rather than assuming every file provides the same layers.

- [x] Read calibrated intensity layers and documented masks; preserve no-data (pilot frequency A; static terrain quality remains pending).
- [x] Convert positive valid power values using `10 * log10(power)` where dB is needed.
- [x] Align acquisitions to a common projected grid; document resampling choices (identical native grids; no resampling).
- [x] Compute signed dB change only over valid common coverage.
- [ ] Treat a water classifier as a separate, versioned method, not an automatic
  interpretation of every dark pixel or backscatter decrease.
- [ ] Account for permanent water, tide, wet soil, vegetation, built-up areas,
  shadow/layover, speckle, and differing acquisition conditions as applicable.
- [x] Calculate area in a suitable projected/equal-area system, not degree pixels (EPSG:32646 projected grid area).
- [x] Report observed area and excluded/unknown area alongside change estimates.

### Gate C — test the central claim

- [ ] Collect independent, dated reference labels where feasible. A neighboring
  satellite product is corroboration, not automatically ground truth.
- [ ] Separate method-tuning samples from evaluation samples; avoid spatial leakage.
- [ ] For a classification claim, report sample counts, confusion matrix,
  precision/recall, and limitations. Do not invent a target accuracy achievement.
- [ ] Assess threshold sensitivity and show if the conclusion changes substantially.
- [ ] Use categorical quality flags with explanations unless confidence probabilities
  have actually been calibrated.
- [ ] If validation is insufficient, label results “candidate water change” or
  “observed radar change”; withhold confirmed-flood and damage claims.

## 6. Backend implementation sequence

### B1. Data models and migrations

- [x] Add explicit SQLite schema migrations before expanding the current schema.
- [ ] Add `regions`, `cases`, `processing_jobs`, `assets`, `analysis_runs`,
  `findings`, and `validation_records`, linked to existing scene records.
- [ ] Store source concept/revision IDs, acquisition metadata, timestamps, checksums,
  method version, parameters, units, geometry, and quality flags.
- [ ] Store large raw files and derived rasters outside SQLite; database rows hold
  references. Ensure public responses never expose credentials or server paths.

### B2. Download and processing worker

- [ ] Start with one separate Python worker and a durable SQLite-backed job queue.
  Atomic claiming, restart recovery, retry limits, and idempotency are required.
- [x] Keep heavy raster work out of FastAPI request handlers. Use bounded/windowed
  reads where possible rather than loading full scenes into memory.
- [ ] Implement queued/running/succeeded/failed/cancelled states, progress, and errors.
- [x] Authenticate downloads server-side; validate source hosts, handle redirects
  safely, and never log credentials. Browser requests select scene IDs, not arbitrary URLs.
- [x] Write assets to temporary locations; publish completed bundles atomically.
- [ ] Add tests for interrupted downloads, duplicate jobs, missing layers, masks,
  grid mismatches, zero valid coverage, and repeatable statistics.

### B3. Derived-product API

Proposed additions; final schemas must be agreed before frontend integration:

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/cases` | Curated cases with readiness, extent, dates, and source attribution |
| `GET /api/v1/cases/{id}` | Versioned manifest, usable dates, metrics, layers, caveats |
| `POST /api/v1/jobs` | Create an allowed processing job; return job ID and HTTP 202 |
| `GET /api/v1/jobs/{id}` | State, stage, progress, retryable error information |
| `GET /api/v1/cases/{id}/layers` | Asset URLs, bounds, CRS, units, legend, no-data semantics |
| `GET /api/v1/cases/{id}/findings` | Change polygons, observed area, interpretation and quality flags |
| `GET /api/v1/findings/{id}` | Evidence, source revisions, method parameters, reference checks |
| `GET /api/v1/cases/{id}/timeseries` | Actual observation timestamps, values, units, gaps |
| `GET /api/v1/cases/{id}/export?format=geojson` | Downloadable case data with provenance; also support CSV/JSON |

- [x] Generate typed frontend contracts from OpenAPI or maintain validated shared fixtures.
  _Frontend: `npm run api:types` writes `src/lib/chattogram/api-schema.d.ts` from the running backend; `/api/v1/region` still needs a response model._
- [ ] Define empty, partial, failed, unavailable, and ready states explicitly.
- [ ] Serve precomputed display assets with cache headers; do not run analyses for
  map pans. Choose precomputed tiles versus a raster tile server after testing a real asset.
- [ ] Public demo access is read-only. Protect job creation and administration.
- [ ] Keep SQLite on a persistent disk; use one controlled writer/worker initially.
  Do not deploy it into an ephemeral frontend runtime.

## 7. Frontend implementation sequence and art direction

### F-A. Replace the glacier assumptions

- [x] Add a typed Chattogram discovery API client and remove glacier-specific
  metrics and labels from the explorer journey.
  _Frontend: `src/lib/chattogram/api.ts`, types generated from the backend OpenAPI schema (`npm run api:types`)._
- [ ] Add the processed-case provider once the case API is available.
- [x] Separate the real Chattogram discovery workspace from the Jakobshavn sample dashboard in navigation.
- [x] Simplify navigation to **Explore**, **Compare**, **Evidence**, and **About**.
  _Frontend: `/chattogram` has these four views, plus an Overview front door and the Scene catalogue (formerly `/explore`), in the shared dashboard shell._
- [x] Keep a single selected case/date/extent state across map, chart, and evidence.
  _Frontend: stack, before/after dates, map view and selected acquisition live in the URL (`CaseProvider`)._

### F-B. Build the main screen around the map

Target desktop composition: a dominant map occupying about two thirds of the
screen, a compact evidence panel, and a bottom timeline. Put the case name,
observation dates, and data source above the map. Avoid a wall of small metric cards.

- [x] Use Mapbox GL with georeferenced catalog polygons, NASA image overlays, and attributed Mapbox context.
  _Frontend: `/chattogram` also draws the real NISAR GCOV browse quicklooks, georeferenced from ASF's KML or the CMR footprint._
- [x] Evaluate the map against the first real processed NISAR raster layer.
- [x] Reuse the established navy surfaces, ice-blue accents, typography, and shared components across the explorer, dashboard, and landing navigation.
- [x] Use ink/navy surfaces, warm white text, cyan for new water candidates, and
  amber for recession candidates, with patterns/icons for accessibility.
  _Frontend: colours checked with a CVD/contrast validator; each category also has its own stripe direction and icon. The map layer is ready for `/findings` polygons._
- [x] Use a separate diverging legend for signed backscatter change. Do not reuse
  water-category colors in a way that implies classification.
  _Frontend: magenta–grey–green dB scale, ±6 dB; never drawn together with the categories (see `src/lib/chattogram/palette.ts`)._
- [x] Add a named city landmark, a scale bar, restrained boundaries, and always-visible discovery legends.
  _Frontend: `/chattogram` names eight landmarks (Chattogram, Cox’s Bazar, Feni, Noakhali, Sandwip, Hatiya, Maheshkhali, Kaptai Lake)._
- [x] Add hover values, selected-area outlines, and smooth transitions lasting
  roughly 150–300 ms. Respect reduced-motion settings.
  _Frontend: hover shows each acquisition's date, time, track and polarizations; pixel values follow once processed rasters exist._
- [x] At 1920×1080 recording size, make dates, the selected finding, and primary
  numbers readable without zooming into the footage.

### F-C. Signature interactions

1. **The reveal:** drag the before/after divider and see the same river landscape
   on two actual NISAR observation dates.
2. **The explanation:** click a highlighted area; a panel connects the map to a
   chart, the measured change, and an understandable uncertainty statement.
3. **The replay:** play a sequence of actual acquisitions, with chart and map
   updating together. If only two suitable dates exist, use a two-date comparison.
4. **The handoff:** export a concise observation brief with evidence and attribution.

### F-D. Performance and delivery targets

- [x] Preload the curated demo case and next playback frame; lazy-load secondary content.
- [x] Target a usable initial view within three seconds on the rehearsed setup,
  and cached date changes within 300 ms. Measure and report actual results.
  _Measured on /chattogram (1920×1080, software-rendered test browser): panel and dates 1.3–1.4 s; first radar quicklook 2.8–3.3 s once the server has it cached; switching to an already-loaded date 31–276 ms (one 1.2 s outlier). A date never fetched before took 8–11 s from ASF; with the frozen case each quicklook file loads in about 3 ms (measured), and what remains of a date change is the map redraw._
- [x] Keep interactions responsive on the recording laptop; test mobile at 390 px width.
  _Frontend: all four /chattogram views checked at 390 px: no sideways scroll, nav fits, the reveal works by touch._
- [x] Handle unavailable tiles, no observations, partial coverage, and backend failure
  with useful UI rather than silent blank maps or invented values.
  _Frontend: backend down shows how to start it with a working Try again; empty catalogue, missing quicklook, basemap failure and missing /cases each say so on screen._
- [ ] Save a link that restores case, dates, selected finding, and extent.
  _Frontend: the /chattogram URL restores stack, before/after dates, map extent and selected acquisition. Selected finding waits for findings to exist._

## 8. Build milestones and stop conditions

| Milestone | Deliverable | Depends on | Exit gate |
| --- | --- | --- | --- |
| M1 — prove the data | Selected small case, real files, compatible acquisitions, reference plan | Earthdata access and boundary source | Gate A passes |
| M2 — prove the result | Processed pair, numeric outputs, validation report | M1 | Gates B/C pass at the claimed evidence level |
| M3 — connect the product | Case API, Chattogram map, before/after, evidence drawer | M2 | A new user can complete the central journey |
| M4 — make it memorable | Timeline if data supports it, clear visual system, observation brief | M3 | All visible values reconcile with backend outputs |
| M5 — make it reliable | Deployment, frozen replay bundle, accessibility, performance | M4 | Demo works after restart and without fresh NASA access |
| M6 — tell the story | Script, screen capture, captions, credits, final submission | M5 | Rehearsed video fits 240 seconds and current event rules |

Reserve at least the final quarter of available project time for validation,
integration, and presentation. Freeze feature development before recording.

If time becomes tight, cut in this order: 3D terrain, extra context overlays,
rainfall integration, automated narration, then multi-date playback. Preserve
the real NISAR pair, truthful change result, evidence drawer, and complete demo.

## 9. The 240-second video

Use one named place and one real case throughout. Write the final finding only
after validation. Target approximately 460–520 spoken words, allowing pauses
for interactions and readable captions. Record the working application.

| Time | Duration | On screen | Narrative purpose |
| --- | --- | --- | --- |
| 00:00–00:20 | 20 s | Chattogram locator map and a sourced local scene or team-owned footage | Establish the place and the concrete question: where did surface-water conditions change? |
| 00:20–00:45 | 25 s | Brief radar/cloud explanation, then actual NISAR acquisition cards | Explain why NASA-ISRO radar observations matter and identify the real dates used |
| 00:45–01:15 | 30 s | Open the curated case; orient with named landmarks and coverage | Show this is a working application tied to a real local study area |
| 01:15–01:55 | 40 s | Before/after swipe followed by the change layer | Deliver the strongest visual moment and state one supported finding |
| 01:55–02:30 | 35 s | Select a finding; show chart, valid area, evidence, and limitations | Explain how the result was produced and why it is credible |
| 02:30–03:00 | 30 s | Timeline replay, or a deeper two-date comparison if needed | Show surface change over actual observation dates; optionally add verified rainfall context |
| 03:00–03:30 | 30 s | Export the observation brief; show a plausible analyst workflow | Connect the result to follow-up inspection or research, without claiming deployment impact |
| 03:30–03:50 | 20 s | Compact method/source view and any real user feedback | Demonstrate validation, provenance, openness, and the next achievable step |
| 03:50–04:00 | 10 s | Project title, team, repository/demo links, NASA/ISRO/ASF credit | End with one clear sentence about the project's value |

Possible opening: “What changed along this part of Chattogram between these two
satellite passes—and how can we tell?”

Finding sentence template: “Across [valid observed area], our method identified
[measured result] between [date A] and [date B]. [Reference check] supports this
interpretation; [specific limitation] remains.” Fill only with verified values.

Avoid: long logo sequences, terminal footage, reading feature lists, tiny charts,
unexplained heatmaps, simulated progress, invented testimonials, fake disaster
counts, and labels such as “live” on historical observations.

## 10. Submission readiness checklist

- [ ] One complete real NISAR case is the central demo, not an optional tab.
- [ ] Every visible number is derived from the frozen case and has units/dates.
- [ ] Full pipeline can be rerun from documented inputs, parameters, and versions.
- [ ] Scientific limitations are readable and consistent in UI, brief, and narration.
- [ ] A reviewer can distinguish measured radar change from interpreted water change.
- [ ] At least one independent person completes the user journey; record actual feedback.
- [ ] All public assets and datasets have source/license attribution.
- [ ] Select an appropriate repository license and document third-party attribution.
- [ ] No credentials, large raw downloads, or local databases are committed.
- [ ] API tests, raster checks, frontend build, and end-to-end demo checks pass.
- [ ] Public demo is reachable; job endpoints are protected; data persists across restarts.
- [x] Frozen assets replay without upstream access; cached/replayed observations are labeled honestly.
  _Frontend: `?source=frozen` replays with no backend, NASA or ASF request; every page shows the capture time (see docs/CHATTOGRAM.md)._
- [ ] Video is exactly within the verified submission limit, captioned, and legible on a laptop.
- [ ] Submission explains the local problem, NASA data use, method, finding, limitations,
  team contributions, and future work. Awards or real-world adoption are not implied.

## 11. Explicitly deferred

General-purpose AI chatbot, flood prediction, emergency warnings, automatic damage
assessment, satellite control, nationwide coverage, full 3D deformation inversion,
multiple unrelated environmental dashboards, and user-account features beyond
the access controls needed to protect processing operations.

These can be future directions; they are not prerequisites for an excellent entry.

## References and decision basis

- Local challenge brief: [CHALLENGE_SUMMARY.md](CHALLENGE_SUMMARY.md).
- Current implementation: [backend/README.md](backend/README.md).
- [Space Apps 2025 judging guidance](https://spaceapps-v2-staging.s3.amazonaws.com/media/documents/Final_Space_Apps_2025_Judging_Guidelines_for_web.pdf): historical planning reference; confirm 2026 rules separately.
- [ASF NISAR GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/): product properties and available layers.
- [ASF NISAR amplitude guide](https://nisar-docs.asf.alaska.edu/amplitude/): interpreting amplitude products.
- [NASA CMR API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html): metadata discovery.

The feature priorities, interface concept, acceptance gates, and video structure
are our proposed product strategy, not NASA requirements or a prediction of judging outcomes.
