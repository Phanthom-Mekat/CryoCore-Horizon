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

## Scope and next steps

- The `[90.5, 20.5, 92.7, 24.3]` WGS84 box is an **approximate discovery envelope**,
  including surrounding land and sea. It is not an official division boundary;
  matching scenes can intersect only part of it. Add a verified, versioned
  administrative polygon before clipping rasters or reporting area statistics.
- Public metadata search needs no credentials. Protected downloads need NASA
  Earthdata Login. A download worker and credential handling are not implemented.
- No rasters, flood classifications, forest-loss measurements, or deformation
  estimates are produced yet. Implement separate download/processing jobs, keep
  large rasters outside SQLite, and retain source IDs and processing parameters.
- Check calibration maturity, polarization, quality masks, and matching viewing
  geometry before comparing observations. Backscatter changes alone do not prove
  flooding or deforestation; validate against reference observations.
- The `/chattogram` frontend uses this backend's real catalog metadata, always through the Next.js proxy routes. The separate
  original glacier dashboard and pipeline still use the Jakobshavn sample dataset.
- This local development API has no user authentication. Bind to localhost until
  authentication and deployment controls are added.
- Schema version 1 is initialized at startup. Future column changes need explicit
  migrations; `CREATE TABLE IF NOT EXISTS` does not migrate existing columns.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests use temporary SQLite databases and mocked NASA responses, covering restart
persistence, deduplication, pagination, input validation, empty results, failures,
CORS, and OpenAPI. These tests do not establish real coverage or scientific accuracy.

## Official references

- [NASA CMR API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html)
- [ASF NISAR guide](https://nisar-docs.asf.alaska.edu/)
- [NISAR discovery](https://nisar-docs.asf.alaska.edu/asf-search/)
- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)
