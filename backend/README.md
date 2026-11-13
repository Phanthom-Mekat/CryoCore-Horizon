# Chattogram NASA backend

FastAPI + SQLite foundation for **Dancing with the SARs**, described in
`../CHALLENGE_SUMMARY.md`. Focus: **Chattogram Division, Bangladesh**.
NASA-ISRO NISAR is the primary mission. GCOV is the starting product for surface
water, coastal, and vegetation change research. GUNW and GOFF discovery are also
supported for later research. Supplemental observations must not replace NISAR.

## Run (PowerShell, from repository root)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env  # optional; defaults work without it
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Python 3.11+ is required. On macOS/Linux use `.venv/bin/python`.
Swagger UI: <http://127.0.0.1:8000/docs>.
SQLite initializes at `backend/data/cryocore.sqlite3` on startup. Configured relative
paths resolve from `backend/`, independent of working directory. `.env.example`
lists the settings. Local Next.js origins on port 3000 are enabled through CORS.

## API

The frontend's Chattogram case is at `/chattogram` in Next.js (its Scene catalogue, formerly `/explore`, uses this endpoint). Its
`GET /api/v1/explorer` endpoint returns the attributed 2018 BBS/HDX division boundary,
stored scene footprints that intersect it, and acquisition-day counts. It accepts
optional `product`, `start_date`, and `end_date` filters. See
[the feature notes](../docs/EXPLORER.md). Shapely is required; rerun the editable
install command when updating an existing environment.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Application and SQLite connectivity |
| GET | `/api/v1/region` | Study area, bounding box, limitations |
| GET | `/api/v1/sources` | NASA attribution and supported products |
| POST | `/api/v1/nasa/search` | Discover and persist one page of NISAR metadata |
| GET | `/api/v1/scenes?product=GCOV&limit=25&offset=0` | Browse stored scenes |
| GET | `/api/v1/scenes/{concept_id}` | Full provenance and source URLs |
| GET | `/api/v1/curated-cases` | Curated cases: status, stack, before/after granules, analysis area |
| GET | `/api/v1/curated-cases/{id}` | Case plus method, metrics, caveats, sources, latest job |
| GET | `/api/v1/curated-cases/{id}/layers` | Before/after/change dB PNGs: URL, corners, units, scale, palette (`[]` until ready) |
| GET | `/api/v1/curated-cases/{id}/assets/{name}.png` | Layer image, `Cache-Control: immutable` (URLs carry `?v=<job>`) |
| GET | `/api/v1/curated-cases/{id}/findings` | GeoJSON "Observed radar change" polygons (empty until ready) |
| GET | `/api/v1/findings/{id}` | One finding plus evidence: sources, parameters, method version, reference checks |
| GET | `/api/v1/curated-cases/{id}/timeseries` | Per-date dB statistics over pixels valid on both dates |
| GET | `/api/v1/curated-cases/{id}/sensitivity` | Changed area, region count and listed findings still present at 2–6 dB thresholds; empty for older bundles |
| GET | `/api/v1/curated-cases/{id}/export?format=json\|csv\|geojson` | Download with provenance (409 until ready) |
| POST | `/api/v1/jobs` `{case_id}` | Queue processing (202). Needs `X-Admin-Token` = `CRYO_ADMIN_TOKEN`; 403 if unset |
| GET | `/api/v1/jobs/{id}` | Job state, stage, progress, error, retryable, attempts |
| POST | `/api/v1/jobs/{id}/cancel` | Cancel a queued or running job (admin token; 409 if it already finished). A running worker stops at its next progress check and publishes nothing |

Case status is `ready` once a bundle is published, otherwise it follows the latest job: `not_processed`, `queued`,
`running`, `failed`, or `needs_credentials` (the job failed for want of Earthdata Login). Every case GET reads only
SQLite and `data/cases/<id>/`, never NASA, so a recorded demo replays offline. Responses carry no filesystem paths or
credentials.

```powershell
$query = @{start_date="2026-01-01"; end_date="2026-11-12"; product="GCOV"; page_size=25; page=1} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/nasa/search -ContentType application/json -Body $query
```

The adapter resolves NISAR collection IDs dynamically through NASA CMR and filters
granules by dates and study envelope. Dates include full UTC days. Increment
`page` while `has_more` is true; each page is limited to 100 records. Catalog pages
are live queries, not immutable snapshots. Repeated searches upsert by concept ID
without overwriting newer revisions. Raw UMM metadata, URLs, retrieval timestamps,
and search history are preserved. Zero matching scenes returns an empty list;
upstream failures return HTTP 502 without a successful-search record. No synthetic
observations are seeded.

## Catalog sync, case preparation and the worker

Run from `backend/` (PowerShell: `.\.venv\Scripts\python.exe`, below `python` for short):

```powershell
python -m app.cli sync --start 2026-01-01                 # pages all GCOV metadata from NASA CMR (public, no login)
python -m app.cli prepare-case karnaphuli-estuary --from-extracts   # reprocess from the committed subsets: no download
python -m app.cli prepare-case karnaphuli-estuary         # queue + run the case now in this process (downloads 12.4 GB)
python -m app.cli extract-case karnaphuli-estuary         # cut the downloaded files to the subsets processing reads
python -m app.worker                                      # or: long-running worker that processes queued jobs
python -m app.cli migrate                                 # apply schema migrations and print the version
```

`sync` defaults `--end` to today and `--product` to GCOV. The curated case is defined in
`app/assets/analysis-areas.geojson` (team-drawn rectangle and pinned before/after concept IDs). Why that area and those
dates: [case-selection.md](../docs/case-selection.md).

A job resolves both scenes from the local catalog, downloads the two HDF5 files (about 12.4 GB), and runs
`app.processing.process_pair` into `data/cases/.tmp-<id>-<job>/`. It then swaps the finished bundle into `data/cases/<id>/`
(`manifest.json`, `before_db.png`, `after_db.png`, `change_db.png`, `findings.geojson`, `timeseries.json`, and `sensitivity.json`, which is optional
so bundles made before it existed still publish). A half-written bundle is never served. Downloads:

- authenticate with `CRYO_EARTHDATA_TOKEN` (bearer), otherwise `~/.netrc` / `~/_netrc` for `urs.earthdata.nasa.gov`;
- follow redirects by hand, only to https hosts on an allowlist (URS, `*.earthdatacloud.nasa.gov`, ASF's pinned
  CloudFront distribution `d1mv8zhcvry6x4.cloudfront.net`, `*.asf.alaska.edu`, S3).
  Authorization goes only to URS/earthdatacloud, and a password only to URS;
- resume through `<file>.part` with HTTP Range, then check the CMR size and MD5. Free disk space is checked first;
- never log credentials or signed URLs.

Without credentials the job fails with `error_code: needs_credentials` and says how to fix it. The case then shows
`needs_credentials`. Retryable failures (network, 5xx, size or checksum mismatch, unexpected errors) are requeued up to
`CRYO_JOB_MAX_ATTEMPTS`. If a running job's heartbeat is older than `CRYO_JOB_STALE_SECONDS`, the job is requeued. Ctrl+C
requeues the current job without counting it as an attempt. Jobs are claimed atomically
(`UPDATE … WHERE state='queued' RETURNING`), and a partial unique index allows only one active job per case, so a
duplicate `POST /jobs` returns the existing job. Run one worker per database.

### Committed extracts: reprocess without the 12.4 GB download

Processing reads one window of each 6 GB file: the analysis rectangle plus a margin, frequency A. `extract-case` copies
exactly that window into `data/extracts/<case>/<granule>.subset.h5`, keeping the original HDF5 paths and attributes
(HHHH, HVHV, mask, the window's coordinates, projection, the identification group and the RTC convention), so
`app.processing` reads a subset unchanged. `extracts.json` records each subset's SHA-256, its source granule, concept
ID, collection, version and full-file MD5, and the window's rows and columns in the full grid.

For `karnaphuli-estuary` the two subsets are 9.7 MB each (0.16% of the downloads) and are committed. Re-processing from
them reproduces the published bundle byte for byte (metrics, findings, timeseries and all three PNGs; checked 13 Nov
2026), and `tests/test_extract.py` checks the same on synthetic files. `--from-extracts` refuses a subset whose SHA-256
has changed or whose concept IDs differ from the case's pinned pair. After cloning, run it once so the backend serves
the case.

## Scope and next steps

- The `[90.5, 20.5, 92.7, 24.3]` WGS84 box is an **approximate discovery envelope**,
  including surrounding land and sea. It is not an official division boundary;
  matching scenes can intersect only part of it. Add a verified, versioned
  administrative polygon before clipping rasters or reporting area statistics.
- Public metadata search needs no credentials. Protected downloads need NASA
  Earthdata Login (see above).
- The pipeline produces observed radar backscatter change only, not flood, water or damage classifications. Raw files
  and rasters stay outside SQLite; rows keep source IDs, revisions, sizes, checksums, method versions and parameters.
  Earthdata Login. Bounded metadata inspection uses a server-side bearer token;
  resumable operator downloads are implemented; queued processing workers remain planned.
- Experimental radar-change GeoTIFFs are available for a small pilot; no flood
  classifications, forest-loss measurements or deformation estimates are produced. Keep
  large rasters outside SQLite, and retain source IDs and processing parameters.
- Check calibration maturity, polarization, quality masks, and matching viewing
  geometry before comparing observations. Backscatter changes alone do not prove
  flooding or deforestation; validate against reference observations.
- The `/chattogram` frontend uses this backend's real catalog metadata, always through the Next.js proxy routes.
- Read endpoints are public. Only `POST /api/v1/jobs` and `POST /api/v1/jobs/{id}/cancel` are protected, by the admin token. Bind to localhost until
  deployment controls are added.
- Schema migrations are explicit and ordered (`MIGRATIONS` in `app/database.py`, recorded in `schema_version` and
  `PRAGMA user_version`). v1 holds the catalog (scenes, searches). v2 adds regions, cases, processing_jobs, assets,
  analysis_runs, findings and validation_records. An existing v1 database migrates in place at startup. Add a new
  version for any schema change and never edit a shipped one.
- This local development API has no user authentication. Bind to localhost until
  authentication and deployment controls are added.
- Schema version 3 adds durable download records through ordered transactional migrations, preserving existing scenes, searches and inspections. Future column changes need explicit
  migrations; `CREATE TABLE IF NOT EXISTS` does not migrate existing columns.

## Inspect a real GCOV file

Set `EARTHDATA_TOKEN` in the ignored `backend/.env`, then run from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.prepare G4405731724-ASF
```

The scene must already exist in the local catalog. This command reads HDF5 metadata
through authenticated HTTP ranges, with a default 32 MiB download budget (adjust
with `--budget-mib 1..128`). It does not download the entire file. Authorization is
sent only to the NASA origin, never to the signed CDN redirect. Unknown redirect
hosts, ignored ranges, incomplete responses, and changed ETags fail closed.
Retry a failed inspection by rerunning the command; no partial report is published.
Successful reports are stored by scene and CMR revision in SQLite. Fetch the current
revision through `GET /api/v1/scenes/{concept_id}/inspection`; uninspected revisions
return `status: not_inspected`. This endpoint never triggers remote downloads.

The inspection lists layers, dimensions, units, projection, coordinate endpoints,
and small identification fields. It does not validate full-file checksums, read
raster arrays, establish mask coverage, or certify a compatible comparison pair.
Reports deliberately retain `analysis_ready: false`. Raster processing, a queued
worker and a frontend preparation view are still pending.

## Resumable downloads and pair checks

```powershell
.\.venv\Scripts\python.exe -m app.prepare G4362350526-ASF --download --transfer-mib 64
```

This operator command transfers at most 64 MiB per invocation (the default),
in 4 MiB chunks, and pauses at its budget. Rerun it to resume. Increase the budget
explicitly for a full transfer after checking available storage. Set
`CRYO_DOWNLOAD_DIRECTORY` to relocate assets (default `backend/data/downloads`).
Keep that directory outside source control.

An OS lock prevents duplicate writers and releases on process exit. SQLite stores
durable `running`, `paused`, `failed`, or `succeeded` states, byte progress, ETag,
attempt count and sanitized errors. A hard-killed process can leave `running`
in the report; rerunning reclaims the OS lock and resumes the last checkpoint.
There is no automatic queue, cancellation API or background retry loop yet.

ETags pin the source across chunks and restarts. A failed transfer preserves its
last durable chunk; uncheckpointed tail bytes are truncated on recovery. After
the catalog MD5 matches, SHA-256 is recorded and the `.part` file is atomically
renamed to `.h5`. Reusing a completed file rechecks integrity. Checksum mismatches
discard the invalid partial file and require a fresh attempt. Failed or paused
files are never served as completed assets. No raw-file serving endpoint exists.

- `GET /api/v1/scenes/{concept_id}/downloads`: current-revision progress, no server paths.
- `GET /api/v1/pairs/assess?before=...&after=...`: collection, acquisition settings,
  footprint overlap, inspected product metadata, grids and required mask dimensions.

Both endpoints are read-only and perform no remote requests. Pair compatibility
is a metadata gate; `analysis_ready` stays false until pixel-level processing and
quality evaluation exist. See [case-selection notes](../docs/case-selection.md).

## Calibrated radar-window pilot

```powershell
.\.venv\Scripts\python.exe -m app.subset
```

This fixed, versioned pilot selects a 256 × 256 frequency-A window near
91.845 E, 22.33 N in the inspected July/October pair. It caps transfers at 128 MiB
per source, reads only the required HDF5 chunks, and pins each source to its
inspected ETag. No full-file checksum is claimed for remote subsets.

Positive finite HHHH/HVHV power is converted to gamma0 dB. Valid pixels must have
a documented fully-focused subswath code, zero input exceptions, and lie inside
the intersection of the reference division polygon and both catalog footprints.
Signed change is **after minus before**, computed only over common valid pixels.
Both grids must match exactly; this version rejects mismatches instead of resampling.
Source no-data remains NaN in the float32 GeoTIFFs. Boolean common-coverage rasters
use 1 for included pixels and 0 for all excluded pixels.

Completed bundles are atomically published under ignored `backend/data/cases/`:
four date/polarization dB GeoTIFFs, two signed-change GeoTIFFs, two common-coverage
rasters and a manifest with source IDs, hashes, mask rules and coverage statistics.
Only complete bundles appear at `GET /api/v1/cases` and
`GET /api/v1/cases/{id}`. Download listed assets at
`GET /api/v1/cases/{id}/assets/{name}`. No request handler initiates processing.

These are experimental radar-change products, not flood or damage classifications.
Mixed-mode/provisional calibration, static terrain-quality masking, seasonal/tidal
confounders and independent validation remain unresolved. The calibrated pilot is integrated at `/chattogram/processed`; the broader scene
explorer retains browse imagery for dates without processed products.

## Shared data for collaborators

The repository includes the processed radar pilot, source-inspection reports and
reference boundary in [`data/`](data/README.md). Pulling the repository is enough
to obtain the calibrated case; no Earthdata token is needed to view or sample it.
Install dependencies and run the servers normally. Each developer supplies their
own Mapbox public token for the basemap. Local databases and incomplete raw
downloads are intentionally excluded; fresh NASA access still needs credentials.

## Measured observation brief

`GET /api/v1/cases/{id}/brief` returns an observation report tied to the published
case's exact source pair. `?format=csv` downloads one row per polarization with
full-precision measurements, dates, source IDs, method and caveats. JSON also
includes grid metadata and asset hashes. No upstream requests or processing
are triggered. P05/P95 are pixel-distribution percentiles, not confidence bounds;
HH and HV areas must not be added together.

The **Observation brief** button on the calibrated radar page opens a dedicated
print-friendly report with a distribution chart, coverage table and provenance.
The separate browse brief continues to describe its own selected acquisitions.

## Area evidence

`GET /api/v1/cases/{id}/area?lon1=91.84&lat1=22.33&lon2=91.85&lat2=22.34`
analyses the native-grid rectangle between the two clicked pixels. Results
include a WGS84 footprint, clipped window, HH/HV medians, valid/excluded areas,
change histograms, source records, hashes and limitations. Reads are bounded to
one million pixels per selection; no upstream data request is made. Missing
measurements are null. Histogram tails retain changes outside ±6 dB. The result
is exploratory evidence, not a classified event.

## Native pixel evidence

`GET /api/v1/cases/{id}/sample?longitude=91.845&latitude=22.33` reads the
containing native pixel from each published HH/HV GeoTIFF. It returns before,
after and signed change in dB, the pixel centre and grid indices, source
acquisition IDs/revisions, method and asset hashes. Values are neither
interpolated nor clipped to the preview legend. No NASA request is made.

Excluded measurements return null change, distinct from a measured zero.
Locations outside the processed window return `outside_extent`. Saved masks
cannot identify every individual exclusion cause. This is radar evidence,
not a flood classification or an independently validated finding.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests use temporary SQLite databases and mocked NASA responses, covering restart
persistence, deduplication, pagination, input validation, empty results, failures,
CORS, and OpenAPI. The worker and download tests also cover:

- v1→v2 migration and atomic claiming;
- stale-job recovery and retry limits;
- needs-credentials handling, and atomic publishing that never serves incomplete output;
- interrupted-download resume (`httpx.MockTransport`), host allowlist, credential forwarding and checksum checks;
- offline case replay and asset path traversal.

They use a fake `process_pair` and bytes generated at test time. These tests do not establish real coverage or
scientific accuracy.

### Synthetic QA bundle (ready-path check only, never NISAR)

`tests/qa_synthetic_case.py` runs the real worker and processing path on two HDF5 fixtures generated at run time
and publishes a bundle for `karnaphuli-estuary`. It refuses to write inside the repository, so set both paths to a
temporary folder first. Every such manifest has `"synthetic_fixture": true` (the fixtures carry a root attribute that
`app.processing` reads). The API treats that bundle as unpublished unless `CRYO_ALLOW_SYNTHETIC_QA=1` is set, and the
frontend then shows a "SYNTHETIC QA DATA — NOT NISAR" banner on every case page.

```powershell
$env:CRYO_DATA_DIR = "$env:TEMP\cryocore-qa\data"; $env:CRYO_DATABASE_PATH = "$env:TEMP\cryocore-qa\qa.sqlite3"
.\.venv\Scripts\python.exe tests\qa_synthetic_case.py
.\.venv\Scripts\python.exe -m app.cli sync --start 2026-01-01   # public catalog, so the UI can match the pair
$env:CRYO_ALLOW_SYNTHETIC_QA = "1"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8011
```

## Official references

- [NASA CMR API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html)
- [ASF NISAR guide](https://nisar-docs.asf.alaska.edu/)
- [NISAR discovery](https://nisar-docs.asf.alaska.edu/asf-search/)
- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)
