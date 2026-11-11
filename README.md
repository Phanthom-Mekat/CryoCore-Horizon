# CryoCore Horizon

## Backend development

The new [FastAPI + SQLite backend](backend/README.md) focuses on **Chattogram
Division, Bangladesh**, using NASA-ISRO NISAR metadata from NASA Earthdata CMR.
See its README for setup, endpoints, and current limitations. The frontend below
still demonstrates the original Jakobshavn sample dataset; connecting it to the
Chattogram backend is a subsequent step.

## Chattogram observation explorer

The first integrated feature is at **[/explore](http://localhost:3000/explore)**:
NASA GCOV catalog footprints, an attributed division boundary, date filtering,
scene evidence, and a tilted MapLibre map with NASA GIBS Blue Marble context.
It discovers observations; it does not yet compute environmental changes.

Start the backend using [its instructions](backend/README.md), then run `pnpm dev`.
The frontend proxies its two explorer requests to `http://127.0.0.1:8000` by
default; set server-side `BACKEND_URL` for another backend location. No client
secret or Earthdata login is needed for this metadata feature. A fresh database
starts empty: use **Discover observations**, then **Load next page** if offered.

Use pnpm for Node dependencies (`pnpm install`, `pnpm build`). See
[the explorer implementation notes](docs/EXPLORER.md) for architecture, data
provenance, library choices, validation, and remaining work.

Team CryoCore Horizon's entry for the NASA Space Apps Challenge 2026, **Dancing with the SARs**. We use radar from NISAR (NASA–ISRO) to track Jakobshavn Glacier (Sermeq Kujalleq), Greenland's fastest glacier, through cloud and polar night.

- `/`: project page with a live 3D view beside the NISAR spacecraft
- `/dashboard`: ice speed map, speed over time, calving front position, radar before/after

## Run the site

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production check
```

## Dashboard data

The dashboard reads static files from `public/data/jakobshavn/`. The file format is defined in `src/lib/dashboard-data.ts`.

The files in the repo are **sample data** (`"sample": true` in `manifest.json`). They are synthetic placeholders, and the dashboard shows a "Sample data" banner while they're in use. The basemap is a real image: Sentinel-2 via NASA HLS, 14 July 2025, from NASA GIBS.

### Replace the sample with real NISAR data (at the hackathon)

You need Python 3.10+ and a free NASA Earthdata login (https://urs.earthdata.nasa.gov).

```bash
pip install asf_search h5py numpy pyproj scipy pillow
export EARTHDATA_USERNAME=...   # or put urs.earthdata.nasa.gov in ~/.netrc; never commit credentials
export EARTHDATA_PASSWORD=...

python scripts/nisar_pipeline.py search --start 2025-10-01   # track 170, frame 53 by default
python scripts/nisar_pipeline.py download                     # ~31 GB into data/raw (git-ignored)
python scripts/nisar_pipeline.py inspect data/raw/<a GOFF file>.h5   # confirm the offset layer names
python scripts/nisar_pipeline.py build                        # writes public/data/jakobshavn with sample: false
```

In November 2026, ASF listed 18 GCOV and 15 GOFF files for track 170 / frame 53 over the glacier, from Oct 2025 to Oct 2026. Run `inspect` before `build`. The GOFF layer paths are matched by name and haven't been checked against a real file yet.

The pipeline's simplifications (2-D speed from offsets, front picked along one flowline) are listed at the top of `scripts/nisar_pipeline.py`. Mention them in the submission.

### Checks

```bash
python scripts/test_pipeline.py                                # pipeline helpers
node --experimental-strip-types scripts/check-sun.mts          # sun position behind the 3D view
```

### Regenerate assets

- `node scripts/make-sample-data.mjs <basemap-hls.png>`: the sample dataset
- `node scripts/make-textures.mjs <folder>`: Earth textures for the 3D view (sources listed in the script)

## Credits

NISAR data: NASA and ISRO, distributed by the Alaska Satellite Facility DAAC. Earth imagery: NASA Blue Marble, VIIRS Black Marble and HLS via NASA GIBS. Glacier facts: UNESCO World Heritage Centre. This is not an official NASA or ISRO website.
