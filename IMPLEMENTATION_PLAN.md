# CryoCore Horizon: Chattogram implementation plan

Status: discovery explorer implemented on `backendv1`; scientific case processing remains planned.

Implementation update: the first discovery increment is implemented at `/explore`.
It includes an attributed 2018 BBS/HDX reference boundary, real NASA catalog
footprints, polygon-intersection filtering, date selection, and source inspection.
See [feature notes](docs/EXPLORER.md). F01 remains incomplete for analysis use until
the boundary's current suitability and a smaller analysis polygon are verified;
F02 still needs real-file inspection and a scientifically compatible pair.
Prepared: 12 November 2026.

### Completed discovery increment

- [x] Serve catalog footprints, acquisition-day counts, and boundary provenance through the FastAPI explorer endpoint.
- [x] Filter actual scene polygons against the division polygon; report excluded and missing footprints separately.
- [x] Add reproducible boundary preparation, pinned source metadata, checksum, and license attribution.
- [x] Connect real NASA CMR search and pagination to the SQLite catalog through server-side frontend routes.
- [x] Build a MapLibre explorer with NASA GIBS context, selectable scenes, date filtering, and source inspection.
- [x] Match the existing landing/dashboard aesthetic using the shared brand, dashboard shell, navigation, page header, KPI components, and color tokens.
- [x] Adopt pnpm with a committed lockfile and document frontend/backend setup and data limitations.
- [x] Pass 17 backend tests, the production frontend build, and TypeScript checking; inspect desktop and 390 px mobile layouts.

These completed tasks cover discovery, not processed radar imagery or validated
surface-change findings. F01/F02 and the scientific milestones remain incomplete.

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
- [ ] Choose a manageable analysis subset with actual overlapping NISAR coverage.
- [ ] Inspect real files and record acquisition times, product versions, maturity,
  orbit/track, frequency, polarization, and relevant quality metadata.
- [ ] Confirm a compatible before/after pair; three or more dates unlock playback.
- [ ] Identify reference observations appropriate to those dates and the phenomenon.
- [ ] Record file sizes and an achievable storage/processing budget before bulk downloads.
- [ ] Write `case-selection.md` with chosen location/dates, rejected alternatives,
  known confounders, and the claim the data can support.

**Exit condition:** a real pair can be processed and compared. If this fails, change
the dates or subset, or use the backscatter-change fallback. Do not fabricate an event.

### Gate B — observation before interpretation

GCOV provides geocoded, terrain-corrected radar covariance/backscatter, with
available polarizations dependent on the acquisition. Confirm the actual file
layout and metadata rather than assuming every file provides the same layers.

- [ ] Read calibrated intensity layers and documented masks; preserve no-data.
- [ ] Convert positive valid power values using `10 * log10(power)` where dB is needed.
- [ ] Align acquisitions to a common projected grid; document resampling choices.
- [ ] Compute signed dB change only over valid common coverage.
- [ ] Treat a water classifier as a separate, versioned method, not an automatic
  interpretation of every dark pixel or backscatter decrease.
- [ ] Account for permanent water, tide, wet soil, vegetation, built-up areas,
  shadow/layover, speckle, and differing acquisition conditions as applicable.
- [ ] Calculate area in a suitable projected/equal-area system, not degree pixels.
- [ ] Report observed area and excluded/unknown area alongside change estimates.

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

- [ ] Add explicit SQLite schema migrations before expanding the current schema.
- [ ] Add `regions`, `cases`, `processing_jobs`, `assets`, `analysis_runs`,
  `findings`, and `validation_records`, linked to existing scene records.
- [ ] Store source concept/revision IDs, acquisition metadata, timestamps, checksums,
  method version, parameters, units, geometry, and quality flags.
- [ ] Store large raw files and derived rasters outside SQLite; database rows hold
  references. Ensure public responses never expose credentials or server paths.

### B2. Download and processing worker

- [ ] Start with one separate Python worker and a durable SQLite-backed job queue.
  Atomic claiming, restart recovery, retry limits, and idempotency are required.
- [ ] Keep heavy raster work out of FastAPI request handlers. Use bounded/windowed
  reads where possible rather than loading full scenes into memory.
- [ ] Implement queued/running/succeeded/failed/cancelled states, progress, and errors.
- [ ] Authenticate downloads server-side; validate source hosts, handle redirects
  safely, and never log credentials. Browser requests select scene IDs, not arbitrary URLs.
- [ ] Write assets to temporary locations; publish completed bundles atomically.
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
  _Frontend: `/chattogram` has these four views._
- [x] Keep a single selected case/date/extent state across map, chart, and evidence.
  _Frontend: stack, before/after dates, map view and selected acquisition live in the URL (`CaseProvider`)._

### F-B. Build the main screen around the map

Target desktop composition: a dominant map occupying about two thirds of the
screen, a compact evidence panel, and a bottom timeline. Put the case name,
observation dates, and data source above the map. Avoid a wall of small metric cards.

- [x] Use MapLibre with georeferenced catalog polygons and attributed NASA GIBS raster context.
  _Frontend: `/chattogram` also draws the real NISAR GCOV browse quicklooks, georeferenced from ASF's KML or the CMR footprint._
- [ ] Evaluate the map against the first real processed NISAR raster layer.
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
  _Measured on /chattogram (1920×1080, software-rendered test browser): panel and dates 1.3–1.4 s; first radar quicklook 2.8–3.3 s once the server has it cached; switching to an already-loaded date 31–276 ms (one 1.2 s outlier). A date never fetched before takes 8–11 s from ASF; the frozen replay bundle (F09) removes that._
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
- [ ] Frozen assets replay without upstream access; cached/replayed observations are labeled honestly.
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
