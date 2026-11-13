# CryoCore Horizon

Team CryoCore Horizon's entry for the NASA Space Apps Challenge 2026, **Dancing with the SARs**. We use radar from
NISAR (NASA–ISRO) to follow surface change around Chattogram, Bangladesh, through the monsoon cloud.

- `/`: project page with a live 3D view beside the NISAR spacecraft
- `/chattogram`: the case study (see below)

Plan and progress: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Backend

The [FastAPI + SQLite backend](backend/README.md) serves the NISAR catalogue for Chattogram Division (NASA Earthdata
CMR metadata), the calibrated pilot, and the curated `karnaphuli-estuary` case with its processing worker. See its
README for setup, endpoints, processing jobs and current limitations.

## Chattogram case

The case study is at **[/chattogram](http://localhost:3000/chattogram)**: Overview, Explore map, Compare dates,
Calibrated radar, Evidence & brief, Scene catalogue (formerly `/explore`, which redirects) and About;
see [docs/CHATTOGRAM.md](docs/CHATTOGRAM.md). It shows NASA GCOV catalog footprints, an attributed division boundary,
real NISAR browse quicklooks, calibrated radar change, scene evidence and interactive Mapbox GL maps. All geographic
maps use Mapbox Standard for context; NASA imagery and scientific layers keep their attribution. Every processed
result is labelled observed radar change, not flooding or water change.

Start the backend using [its instructions](backend/README.md), then run `pnpm dev`. The frontend proxies its requests
to `http://127.0.0.1:8000` by default; set server-side `BACKEND_URL` for another backend location. The browser never
needs an Earthdata login. A fresh database starts empty: use **Discover observations**, then **Load next page** if
offered.

**Frozen case (no backend needed).** `public/data/chattogram/case/` holds a versioned snapshot of the case: the
division view, every intersecting scene, the processed quicklooks for the stacks over Chattogram city and the
calibrated pilot. The pages use it automatically when the backend is unreachable, open it on purpose with
`?source=frozen`, and say so on every page. For a deployment without the backend, set
`NEXT_PUBLIC_CASE_SOURCE=frozen`. Refresh the snapshot with the backend running: `pnpm freeze-case`.

**Rainfall context.** Daily rainfall at Chattogram city from the NASA POWER API (modelled, MERRA-2) is saved in
`public/data/chattogram/rain.json`; refresh it with `pnpm fetch-rain`.

See [the explorer implementation notes](docs/EXPLORER.md) for architecture, data provenance, library choices,
validation and remaining work.

## Run the site

Interactive geographic maps require a public Mapbox token in `.env.local`:
`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token`. See [Mapbox setup](docs/MAPBOX.md) for URL restrictions,
deployment configuration and map behaviour.

The site defaults to light mode. Use the sun/moon button in the landing navigation or the case header to switch
themes. Your choice is saved in browser local storage and shared across pages and tabs. UI themes do not recolour
satellite imagery or change scientific colour scales.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production check
```

### Checks

```bash
pnpm lint
pnpm test                                                      # frontend tests: share links, brief, translation guard
node --experimental-strip-types scripts/check-sun.mts          # sun position behind the 3D view
```

Backend tests: see [backend/README.md](backend/README.md).

### Regenerate assets

- `node scripts/make-textures.mjs <folder>`: Earth textures for the 3D view (sources listed in the script)
- `node scripts/fetch-chattogram.mjs`: the catalogue snapshot behind the landing page
- `pnpm freeze-case`: the frozen Chattogram case (needs the backend running and network access to ASF)
- `pnpm fetch-rain`: NASA POWER daily rainfall for the case (no login needed)

## Credits

NISAR data: NASA and ISRO, distributed by the Alaska Satellite Facility DAAC. Earth imagery: NASA Blue Marble, VIIRS
Black Marble and HLS via NASA GIBS. Division boundary: Bangladesh Bureau of Statistics (BBS) / HDX via geoBoundaries,
CC BY 3.0 IGO. Rainfall: NASA POWER. This is not an official NASA or ISRO website.
