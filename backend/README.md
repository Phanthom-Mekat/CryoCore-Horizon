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
| GET | `/api/v1/cases` | Curated cases: status, stack, before/after granules, analysis area |
| GET | `/api/v1/cases/{id}` | Case plus method, metrics, caveats, sources, latest job |
| GET | `/api/v1/cases/{id}/layers` | Before/after/change dB PNGs: URL, corners, units, scale, palette (`[]` until ready) |
| GET | `/api/v1/cases/{id}/assets/{name}.png` | Layer image, `Cache-Control: immutable` (URLs carry `?v=<job>`) |
| GET | `/api/v1/cases/{id}/findings` | GeoJSON "Observed radar change" polygons (empty until ready) |
| GET | `/api/v1/findings/{id}` | One finding plus evidence: sources, parameters, method version, reference checks |
| GET | `/api/v1/cases/{id}/timeseries` | Per-date dB statistics over pixels valid on both dates |
| GET | `/api/v1/cases/{id}/export?format=json\|csv\|geojson` | Download with provenance (409 until ready) |
| POST | `/api/v1/jobs` `{case_id}` | Queue processing (202). Needs `X-Admin-Token` = `CRYO_ADMIN_TOKEN`; 403 if unset |
| GET | `/api/v1/jobs/{id}` | Job state, stage, progress, error, retryable, attempts |

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
python -m app.cli prepare-case karnaphuli-estuary         # queue + run the case now in this process
python -m app.worker                                      # or: long-running worker that processes queued jobs
python -m app.cli migrate                                 # apply schema migrations and print the version
```

`sync` defaults `--end` to today and `--product` to GCOV. The curated case is defined in
`app/assets/analysis-areas.geojson` (team-drawn rectangle and pinned before/after concept IDs). Why that area and those
dates: [case-selection.md](../docs/case-selection.md).

A job resolves both scenes from the local catalog, downloads the two HDF5 files (about 12.4 GB), and runs
`app.processing.process_pair` into `data/cases/.tmp-<id>-<job>/`. It then swaps the finished bundle into `data/cases/<id>/`
(`manifest.json`, `before_db.png`, `after_db.png`, `change_db.png`, `findings.geojson`, `timeseries.json`). A half-written
bundle is never served. Downloads:

- authenticate with `CRYO_EARTHDATA_TOKEN` (bearer), otherwise `~/.netrc` / `~/_netrc` for `urs.earthdata.nasa.gov`;
- follow redirects by hand, only to https hosts on an allowlist (URS, `*.earthdatacloud.nasa.gov`, `*.asf.alaska.edu`, S3).
  Authorization goes only to URS/earthdatacloud, and a password only to URS;
- resume through `<file>.part` with HTTP Range, then check the CMR size and MD5. Free disk space is checked first;
- never log credentials or signed URLs.

Without credentials the job fails with `error_code: needs_credentials` and says how to fix it. The case then shows
`needs_credentials`. Retryable failures (network, 5xx, size or checksum mismatch, unexpected errors) are requeued up to
`CRYO_JOB_MAX_ATTEMPTS`. If a running job's heartbeat is older than `CRYO_JOB_STALE_SECONDS`, the job is requeued. Ctrl+C
requeues the current job without counting it as an attempt. Jobs are claimed atomically
(`UPDATE … WHERE state='queued' RETURNING`), and a partial unique index allows only one active job per case, so a
duplicate `POST /jobs` returns the existing job. Run one worker per database.

## Scope and next steps

- The `[90.5, 20.5, 92.7, 24.3]` WGS84 box is an **approximate discovery envelope**,
  including surrounding land and sea. It is not an official division boundary;
  matching scenes can intersect only part of it. Add a verified, versioned
  administrative polygon before clipping rasters or reporting area statistics.
- Public metadata search needs no credentials. Protected downloads need NASA
  Earthdata Login (see above).
- The pipeline produces observed radar backscatter change only, not flood, water or damage classifications. Raw files
  and rasters stay outside SQLite; rows keep source IDs, revisions, sizes, checksums, method versions and parameters.
- Check calibration maturity, polarization, quality masks, and matching viewing
  geometry before comparing observations. Backscatter changes alone do not prove
  flooding or deforestation; validate against reference observations.
- The `/chattogram` frontend uses this backend's real catalog metadata, always through the Next.js proxy routes. The separate
  original glacier dashboard and pipeline still use the Jakobshavn sample dataset.
- Read endpoints are public. Only `POST /api/v1/jobs` is protected, by the admin token. Bind to localhost until
  deployment controls are added.
- Schema migrations are explicit and ordered (`MIGRATIONS` in `app/database.py`, recorded in `schema_version` and
  `PRAGMA user_version`). v1 holds the catalog (scenes, searches). v2 adds regions, cases, processing_jobs, assets,
  analysis_runs, findings and validation_records. An existing v1 database migrates in place at startup. Add a new
  version for any schema change and never edit a shipped one.

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
