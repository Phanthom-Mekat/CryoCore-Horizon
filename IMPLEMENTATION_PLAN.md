# CryoCore Horizon: Chattogram implementation plan

Status (13 Nov 2026, after merging PR #2 into `main` at `f8c6197`): discovery catalogue and the frontend case journey use real NISAR metadata and browse quicklooks; the case replays from a frozen snapshot without the backend (F09), in English and Bangla (F15), with NASA rainfall context (F13). There are now **two processed tracks** (see [below](#two-processed-tracks--team-decision-needed)): a small calibrated pilot already processed from real NISAR pixels, and the curated `karnaphuli-estuary` case, processed on 13 Nov 2026 from the real 18 Jun and 16 Oct 2026 NISAR files (175.71 km² valid on both dates; 4.91 km² brighter and 0.20 km² darker by at least 3 dB; 40 listed findings). Both replay from the frozen snapshot. Terrain-quality checks and independent validation remain pending. See the progress tracker below.

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

Updated 13 November 2026 after the PR #2 merge (`f8c6197`). "Partial" includes implemented pilots with remaining scientific validation or broader product work. "Pilot" = the calibrated window at `/api/v1/cases`; "curated case" = `karnaphuli-estuary` at `/api/v1/curated-cases`.

| ID | Feature | Status | Done | Still needed |
| --- | --- | --- | --- | --- |
| F01 | Verified study area | Partial | 2018 BBS/HDX boundary with provenance; scenes filtered by the polygon; drawn on every map; curated analysis polygon: team-drawn lower Karnaphuli/port rectangle (≈175.7 km² equal-area, provenance recorded) in `backend/app/assets/analysis-areas.geojson`, documented in [docs/curated-case.md](docs/curated-case.md) | Confirm the boundary's current suitability; about 16.7 km² of the rectangle (the river channel) lies outside the 2018 polygon, which the docs explain |
| F02 | Real NISAR case selection | Partial | Pilot: real July/October HDF5 metadata inspected, frequency-A gate passes. Curated case: pair (stack `069_A_013`, 18 Jun vs 16 Oct 2026, provisional v1.0.11, HH+HV) processed from the real files: layout, masks and common coverage confirmed (only 0.0002 km² of 175.71 km² excluded) | Mixed-mode implications for the pilot; reference observations (tide heights at both pass times) |
| F03 | Reliable data preparation | Done except cancellation | Resumable authenticated downloads (host allowlist incl. ASF's pinned CloudFront, MD5/size and disk-space checks); durable SQLite job queue with atomic claim, stale-job requeue, retries, `needs_credentials`; `app.worker` and `app.cli prepare-case`; `PrepStatus` panel. Real run 13 Nov: 12.4 GB downloaded, job 2 succeeded and published | A cancel action (`cancelled` exists only as a schema state) |
| F04 | Processed radar layers | Partial | Pilot: real frequency-A HH/HV GeoTIFFs with masks and hashes. Curated case: real HH γ⁰ before/after/change PNGs on the native 10 m UTM grid (1158 × 1571 px), boxcar 5×5, fixed −25..0 dB and ±6 dB scales | Static terrain quality (layover/shadow not separately masked); process HV for the curated case (already in the committed extracts); mixed-mode review |
| F05 | Defensible change map | Partial | Pilot: signed dB change with coverage statistics. Curated case (real): 4.91 km² brighter and 0.20 km² darker by ≥ 3 dB over 175.71 km², 92 regions (40 largest listed), each labelled "Observed radar change" with categorical quality | Confounder assessment (tide, river stage, ships, crops, wind); threshold sensitivity; independent validation; no water classification |
| F06 | Before/after comparison | Complete for pilot | Calibrated HH/HV comparison, keyboard slider, synchronized maps, date badges and common −25..0 dB scale at `/chattogram/processed`; Compare switches to the curated case's calibrated layers when that case is ready | Extend to additional validated acquisitions |
| F07 | Click-to-explain evidence | Partial | Pilot: native HH/HV pixel inspection and JSON. Curated case: 40 real finding polygons on Explore, `FindingPanel` (what changed, why, what is uncertain, sources, method), selection in the URL (`f`); works in the frozen replay | Reference checks (`validation_records` is empty); translate `FindingPanel` |
| F08 | Chattogram overview | Partial | Real catalogue numbers; curated section with real numbers (175.7 km² valid, 4.91 km² observed increase, 0.20 km² observed decrease, 18 Jun → 16 Oct 2026); calibrated pilot strip | Translate the curated section; pick which case leads |
| F09 | Reproducible case replay | Done | Versioned frozen case: catalogue and 29 quicklooks, the calibrated pilot (6 PNGs, 8 GeoTIFFs) and the curated case (detail, 3 layers, 40 findings with evidence, timeseries, JSON/CSV/GeoJSON exports), every file with SHA-256; zero `/api/` requests while replaying, checked on Overview, Explore with a selected finding, Evidence and Calibrated radar | Pixel inspection in a replay; refresh with `pnpm freeze-case` before recording |
| F10 | Validation and methods | Partial | Methods, limitations and claim level in About and Evidence; `validation_records` table and `reference_checks` field in finding evidence; categorical finding quality (strong/moderate/weak with a reason) | Reference data, evaluation samples, results |
| F11 | Timeline playback | Partial | Replay over actual dates, gaps visible; curated per-date statistics (mean, p10, p90 dB over valid pixels) under the Explore timeline | Three or more processed dates for real playback |
| F12 | Local observation brief | Done for current evidence | JSON, CSV, GeoJSON, print; brief JSON carries `processed_case` and `calibrated_pilot`; curated exports from the backend, or from the snapshot while replaying | The pilot window in GeoJSON |
| F13 | NASA rainfall context | Done with a modelled series | NASA POWER daily rainfall (MERRA-2/GEOS-IT, modelled) saved as a static file; charts on Explore and Compare with NISAR passes marked; 7-day totals in Compare, Evidence and the brief; context-not-cause caveat | Swap in GPM IMERG (observed, 0.1°) once an Earthdata login is available to the frontend scripts; refresh with `pnpm fetch-rain` before recording |
| F14 | Community context | Not started | – | Licensed overlays |
| F15 | Local accessibility | Done for the core journey | English/Bangla case journey with a header switch, including the Calibrated radar page and pixel inspector; Bengali dates and fonts, `<html lang>`, keyboard use, colour plus pattern, 390 px in both languages | Translate the PR #2 additions (curated section on Overview, Evidence "Processed" section, `FindingPanel`, `PrepStatus`, synthetic-data banner); a native speaker's review; the Scene catalogue and landing page |
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
- [x] Complete queued-worker lifecycle, processing and frontend preparation status: delivered by PR #2 (see [Curated-case pipeline](#curated-case-pipeline-pr-2--13-november-2026)); the real-data run is still pending.

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

### Native pixel evidence — 13 November 2026

- [x] Sample containing native GeoTIFF pixels through a read-only API, with grid checks and coordinate validation.
- [x] Show HH/HV before, after and signed change in dB on map click, with a selection pin and keyboard-accessible inspect-centre action.
- [x] Distinguish valid zero change, excluded pixels and locations outside the processed window; never substitute zero for missing evidence.
- [x] Add JSON evidence export containing source revisions, acquisition dates, method and asset hashes.
- [x] Pass 48 backend tests, TypeScript, lint and production build; verify real values and map selection on desktop in the in-app browser.
- [ ] Finish inspector-specific mobile and browser-download verification: browser automation stopped responding during these checks.

### Pilot evidence in the brief — 13 November 2026

- [x] Evidence page "Calibrated pilot" card: common valid area, outside-area exclusion, HH/HV median and 5–95% change, link to Calibrated radar; English and Bangla.
- [x] "Measured" level and the header claim use pilot numbers only when the compared dates are the pilot's (matched by CMR concept ID); other pairs say the pilot does not apply.
- [x] Brief JSON `calibrated_pilot`: case ID, method, sources with revisions/ETags, grid, validity rule, statistics, asset SHA-256s, limitations, manifest URL, `covers_compared_pair`.
- [x] Fixed the card always reporting "no processed cases" (it read `{cases: [...]}` as an array).
- [x] Checked in the browser: matching and non-matching pairs, Bangla, JSON download contents, frozen replay (no live request).

### Pilot on Overview, Bangla calibrated radar, pilot in the replay — 13 November 2026

- [x] Overview: calibrated pilot strip (dates, area compared, excluded area, HH/HV median and middle-90% change) through a shared `usePilot()` hook, English and Bangla.
- [x] Calibrated radar page and pixel inspector fully in English and Bangla (controls, legend, evidence panel, map notes); dates and numbers localised.
- [x] `pnpm freeze-case` also freezes the pilot (`public/data/chattogram/case/pilot/`: manifest in `case.json`, 6 display PNGs, 8 GeoTIFFs checked against the published SHA-256); replays read it on Overview, Evidence, the brief and Calibrated radar; the pixel inspector says it needs live data.
- [x] Fixes: no live pilot lingers after switching to the frozen case; Calibrated radar waits for the case source and shows the frozen notice; the excluded-area label includes footprint clipping.
- [x] Checked in the browser (both languages, frozen replay with 0 `/api/` requests, all 14 snapshot files match their hashes); TypeScript, lint and build pass. The map drawing in a replay was not seen (browser pane hidden).

### Curated-case pipeline (PR #2) — 13 November 2026

Merged from `feat/chattogram-home` and documented in [docs/curated-case.md](docs/curated-case.md) and [backend/README.md](backend/README.md).

- [x] Curated case `karnaphuli-estuary`: team-drawn analysis rectangle and pinned pair (`069_A_013`, 18 Jun vs 16 Oct 2026) with rejected alternatives, confounders and the claim the data can support.
- [x] Schema v4: `regions`, `cases`, `processing_jobs`, `assets`, `analysis_runs`, `findings`, `validation_records`; v1 databases migrate in place.
- [x] Job queue and worker: `POST /api/v1/jobs` (admin token, else 403), `GET /api/v1/jobs/{id}`, atomic claim, one active job per case, stale-job requeue, retry limits, `needs_credentials`, Ctrl+C requeue; `python -m app.worker`, `python -m app.cli sync|prepare-case|migrate`.
- [x] Downloads: bearer token or `.netrc`, redirect host allowlist, Range resume, CMR size and MD5 checks, disk-space check, no credentials in logs.
- [x] Processing (`app/processing/`): windowed reads, masks, grid alignment, boxcar speckle filter, ±3 dB regions, equal-area km², findings with categorical quality, before/after/change PNGs, per-date timeseries; atomic bundle swap into `data/cases/<id>/`.
- [x] Read API at `/api/v1/curated-cases…` (summary, detail, layers, assets with immutable cache headers, findings, timeseries, export) and `/api/v1/findings/{id}`; explicit states `not_processed`, `queued`, `running`, `failed`, `needs_credentials`, `ready`.
- [x] Frontend: curated case loaded and polled in `CaseProvider`; finding polygons and `FindingPanel` on Explore; calibrated layers on Compare; `PrepStatus` on Overview and Evidence; processed section on Evidence and in the brief; synthetic-QA banner.
- [x] Tests: 82 backend tests pass after the merge, including interrupted downloads, duplicate jobs, missing layers, masks, grid mismatch, zero coverage, repeatability and a synthetic end-to-end bundle (synthetic data never served unless `CRYO_ALLOW_SYNTHETIC_QA=1`).
- [x] Run `prepare-case karnaphuli-estuary` on real NISAR files (13 Nov: job 2 succeeded; 175.71 km² valid, 4.91 km² increase, 0.20 km² decrease, 92 regions, 40 listed). Needed the CloudFront host fix above.
- [ ] Add a cancel action (`cancelled` is allowed by the schema but nothing sets it).
- [ ] Translate the new UI into Bangla (F15).

### Cleanup — 13 November 2026

- [x] Removed the Jakobshavn glacier sample dashboard: `/dashboard/*` pages, its data loader, charts, speed map, settings, 1.8 MB of sample data, `scripts/make-sample-data.mjs`, the glacier pipeline (`scripts/nisar_pipeline.py`, `test_pipeline.py`) and `docs/DATA_CONTRACT.md`; the sidebar, landing navigation and About no longer link to it.
- [x] Removed unused components and styles: `DaylightChart`, `FjordIllustration`, `Card`/`Toggle`/`Meter` helpers, and 837 lines of CSS that only styled deleted pages (`dashboard.css` now lives in `src/app/chattogram/`).
- [x] Fixed the merge's lint error (frozen state is derived instead of set in an effect) and unused imports; lint, TypeScript, build and 82 backend tests pass.
- [x] Curated downloads may follow ASF's pinned CloudFront distribution (the same host the pilot inspector allows); no credentials are sent to it. Without this the real run stopped at the first redirect.
- [x] README, backend README route table and docs updated to the case-only app.

### Real curated-case run and replay — 13 November 2026

- [x] Processed `karnaphuli-estuary` from the real NISAR files (2 × ≈6.2 GB, MD5 checked) into `backend/data/cases/karnaphuli-estuary/`.
- [x] `pnpm freeze-case` also freezes the curated case when it is ready and real (never a synthetic QA bundle): detail, layers, findings with per-finding evidence, timeseries and the three exports in `public/data/chattogram/case/curated/`, each with SHA-256.
- [x] Replay uses them: Overview and Evidence numbers, Explore layers and finding panel, Compare layers, Evidence exports. Checked with 0 `/api/` requests and all 6 files matching their hashes; the map drawing itself was not seen (browser pane hidden).

### Committed NISAR extracts — 13 November 2026

- [x] Processing reads one window per file; `python -m app.cli extract-case <case>` copies exactly that window (HH, HV, mask, coordinates, projection, identification and RTC metadata, same HDF5 paths) into `backend/data/extracts/<case>/` with `extracts.json` (SHA-256, source granule, concept ID, collection, version, full-file MD5, window in the full grid).
- [x] `karnaphuli-estuary`: 2 × 9.7 MB committed instead of 12.4 GB; `prepare-case --from-extracts` needs no download or credentials and reproduces the published bundle byte for byte (metrics, findings, timeseries, 3 PNGs), checked end to end against an empty data folder.
- [x] Refuses a subset whose SHA-256 changed or whose concept IDs differ from the case's pinned pair; `tests/test_extract.py` proves full-file and subset processing give identical outputs.
- [ ] Delete the 12.4 GB of full files in `backend/data/raw/` on the processing machine once nobody needs to re-extract (they are not committed).

### Two processed tracks — team decision needed

| | Calibrated pilot | Curated case |
| --- | --- | --- |
| API | `/api/v1/cases` | `/api/v1/curated-cases` |
| Pair | stack `163_D_077`, 7 Jul vs 11 Oct 2026, quad-pol | stack `069_A_013`, 18 Jun vs 16 Oct 2026, HH+HV |
| Area | 256 × 256 px window, 21.82 km² valid; river corridor clipped out | ≈175.7 km² rectangle including the river channel |
| Real data | Yes, processed from real NISAR pixels | Yes, processed from the two real files on 13 Nov 2026 |
| UI | Calibrated radar page, Overview strip, Evidence card, frozen replay, pixel inspector, Bangla | Explore findings, Compare layers, Overview/Evidence sections, export (English only) |

The demo should have one central case (submission checklist). Both are now real. The curated case covers the river
and port the plan's story is about (HH only); the pilot is smaller, quad-pol, but clips the river out. Decide which leads the video,
and whether the pilot stays as a secondary view.

### Next up

- **Backend:** review the curated findings against tide, ships and port activity; static terrain quality and mixed-mode review; dated reference evidence (tide heights at both pass times); a job cancel action.
- **Frontend:** translate the PR #2 views (curated sections, `FindingPanel`, `PrepStatus`, banner) into Bangla; finish inspector mobile/export checks; swap the modelled rainfall for GPM IMERG; rework the landing page around the Chattogram case (needs a team decision).
- **Team:** choose the central processed case (above); make the GitHub repository public before submission; fill in the team names on the landing page; choose a repository licence.
- **Setup after pulling `main`:** `pip install -e .` in `backend/` (new `scipy` and `pillow` dependencies), then restart the backend. The local database is already at schema v4 (backup: `backend/data/cryocore.sqlite3.bak-before-v4`), so code older than PR #2 refuses to start on it.

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
- [x] Confirm a compatible before/after pair; three or more dates unlock playback.
  _Pilot pair confirmed from real files (frequency A). Curated pair processed from its real files on 13 Nov 2026 (same track, frame, collection and version; exact pixel lattice; 175.71 km² valid on both dates). Playback still needs a third processed date._
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
  _(Listed for the curated case in docs/curated-case.md, Known confounders; not yet quantified.)_
- [x] Calculate area in a suitable projected/equal-area system, not degree pixels (EPSG:32646 projected grid area).
- [x] Report observed area and excluded/unknown area alongside change estimates.

### Gate C — test the central claim

- [ ] Collect independent, dated reference labels where feasible. A neighboring
  satellite product is corroboration, not automatically ground truth.
- [ ] Separate method-tuning samples from evaluation samples; avoid spatial leakage.
- [ ] For a classification claim, report sample counts, confusion matrix,
  precision/recall, and limitations. Do not invent a target accuracy achievement.
- [ ] Assess threshold sensitivity and show if the conclusion changes substantially.
- [x] Use categorical quality flags with explanations unless confidence probabilities
  have actually been calibrated.
- [x] If validation is insufficient, label results “candidate water change” or
  “observed radar change”; withhold confirmed-flood and damage claims.

## 6. Backend implementation sequence

### B1. Data models and migrations

- [x] Add explicit SQLite schema migrations before expanding the current schema.
- [x] Add `regions`, `cases`, `processing_jobs`, `assets`, `analysis_runs`,
  `findings`, and `validation_records`, linked to existing scene records.
- [x] Store source concept/revision IDs, acquisition metadata, timestamps, checksums,
  method version, parameters, units, geometry, and quality flags.
- [x] Store large raw files and derived rasters outside SQLite; database rows hold
  references. Ensure public responses never expose credentials or server paths.

### B2. Download and processing worker

- [x] Start with one separate Python worker and a durable SQLite-backed job queue.
  Atomic claiming, restart recovery, retry limits, and idempotency are required.
- [x] Keep heavy raster work out of FastAPI request handlers. Use bounded/windowed
  reads where possible rather than loading full scenes into memory.
- [ ] Implement queued/running/succeeded/failed/cancelled states, progress, and errors.
  _Done except cancellation: `cancelled` is a valid state but no endpoint or worker path sets it._
- [x] Authenticate downloads server-side; validate source hosts, handle redirects
  safely, and never log credentials. Browser requests select scene IDs, not arbitrary URLs.
- [x] Write assets to temporary locations; publish completed bundles atomically.
- [x] Add tests for interrupted downloads, duplicate jobs, missing layers, masks,
  grid mismatches, zero valid coverage, and repeatable statistics.

### B3. Derived-product API

Implemented by PR #2. The curated case lives under `/api/v1/curated-cases…` because `/api/v1/cases` already serves the
calibrated pilot; read every `/cases` below as `/curated-cases` for that case. `backend/README.md` still lists the old paths.

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
- [x] Define empty, partial, failed, unavailable, and ready states explicitly.
- [x] Serve precomputed display assets with cache headers; do not run analyses for
  map pans. Choose precomputed tiles versus a raster tile server after testing a real asset.
- [x] Public demo access is read-only. Protect job creation and administration.
- [ ] Keep SQLite on a persistent disk; use one controlled writer/worker initially.
  Do not deploy it into an ephemeral frontend runtime.

## 7. Frontend implementation sequence and art direction

### F-A. Replace the glacier assumptions

- [x] Add a typed Chattogram discovery API client and remove glacier-specific
  metrics and labels from the explorer journey.
  _Frontend: `src/lib/chattogram/api.ts`, types generated from the backend OpenAPI schema (`npm run api:types`)._
- [x] Add the processed-case provider once the case API is available.
  _`CaseProvider` loads and polls the curated case; `usePilot()` loads the pilot (live or from the snapshot)._
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
  _Frontend: hover shows each acquisition's date, time, track and polarizations; the processed view supports click-to-inspect native HH/HV pixel values and a selection pin._
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
- [x] Save a link that restores case, dates, selected finding, and extent.
  _Frontend: the /chattogram URL restores stack, before/after dates, map extent, selected acquisition and the selected finding (`f`). Untested with real findings until the curated case is processed._

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
- [x] Full pipeline can be rerun from documented inputs, parameters, and versions.
  _`prepare-case karnaphuli-estuary --from-extracts` reruns from the committed subsets with the parameters recorded in the bundle manifest (byte-identical, 13 Nov 2026); the full-file path is `prepare-case` with an Earthdata login._
- [ ] Scientific limitations are readable and consistent in UI, brief, and narration.
- [ ] A reviewer can distinguish measured radar change from interpreted water change.
- [ ] At least one independent person completes the user journey; record actual feedback.
- [ ] All public assets and datasets have source/license attribution.
- [ ] Select an appropriate repository license and document third-party attribution.
- [x] No credentials, large raw downloads, or local databases are committed.
  _Checked 13 Nov 2026: only `backend/.env.example`; no `.sqlite3`, `.h5` downloads or `.part` files. The committed `*.subset.h5` files are 9.7 MB extracts, not raw downloads._
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
