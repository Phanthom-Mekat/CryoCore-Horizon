# CryoCore Horizon

**NASA Space Apps Challenge 2026 · Challenge: [Dancing with the SARs](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/) · Bangladesh local event**

The monsoon hides Chattogram from cameras for months. NISAR radar sees through the cloud. CryoCore Horizon turns two
NISAR passes over the lower Karnaphuli river into plain answers that a farmer, an agriculture officer or a relief team
can act on: what changed, where, how sure we are, and what to check next. It works in English and Bangla.

| | |
| --- | --- |
| Live demo | _add the deployed URL_ |
| Demo video (240 s) | _add the YouTube link_ |
| Global video (30 s) | _add the YouTube link_ |
| NASA project page | _add the Space Apps project link_ |

## What it does

- **Sees through the monsoon.** A slider puts a cloud-covered MODIS/VIIRS photo beside NISAR radar from the same morning.
- **A plain answer for every field.** Tap anywhere on the map: what the radar saw, what it likely means, what to do next.
- **Change in 3D.** Every change area rises from the map, coloured by what likely happened and as tall as the radar change.
- **Ask the map, in English or Bangla.** A case assistant reads the case data, answers in plain words, moves the map and
  downloads the brief.
- **Evidence you can hand over.** Every answer keeps its dates, measurements and NASA sources. Download a brief (JSON,
  CSV, GeoJSON) for an officer or a relief team.
- **Works offline.** A frozen snapshot of the case replays without the backend, so the demo never depends on a live API.

### The case: lower Karnaphuli river and Chattogram port

| | |
| --- | --- |
| Area compared | 175.7 km² (team-drawn rectangle, lon 91.79–91.90 E, lat 22.24–22.38 N) |
| Dates | 19 Jun 2026 vs 17 Oct 2026, NISAR track 69, frame 13, ascending |
| Change found | 4.91 km² brighter and 0.20 km² darker by ≥ 3 dB; 92 change regions, the 40 largest listed |
| Reading | 4.54 km² likely crop growth, 0.10 km² likely new water (HV backscatter rules) |

Results are labelled *observed radar change*, not confirmed flooding. Method, rejected alternatives and open checks:
[docs/curated-case.md](docs/curated-case.md).

## How it works

1. **Discover.** The backend searches NASA Earthdata CMR for every NISAR scene over Chattogram Division and keeps the
   ones that cross the division boundary.
2. **Pick a fair pair.** Same track, frame, direction, polarizations, collection and product version, widest date gap.
3. **Process.** Read HH and HV backscatter from the two GCOV HDF5 files, convert to dB, subtract, threshold at 3 dB and
   group the changed pixels into regions.
4. **Explain.** Each region gets a likely meaning from its HV backscatter (e.g. HV up ≥ set dB: likely crop growth; HV
   dropping to water level: likely new water), shown beside NASA POWER rainfall for context.
5. **Show.** A Next.js site with Mapbox GL maps, a three.js globe and 3D change columns, a guided tour and the assistant.

```
NASA CMR / ASF DAAC ──► FastAPI + SQLite backend ──► processed case bundle ──► Next.js site
   (NISAR GCOV)          (search, process, API)         (frozen snapshot)        (maps, 3D, tour, assistant)
```

## NASA data used

| Dataset | Used for |
| --- | --- |
| **NISAR L2 GCOV** (NASA–ISRO, `NISAR_L2_GCOV_PROVISIONAL_V1`, via ASF DAAC) | Core data: HH and HV backscatter for the before/after change map |
| NISAR GUNW, RSLC (catalog only) | Listed in the scene catalogue for future work |
| NASA Earthdata CMR | Scene search, footprints, granule metadata and checksums |
| NASA GIBS: MODIS Terra and VIIRS (SNPP, NOAA-20) Corrected Reflectance | The cloudy camera photo beside the radar |
| NASA GIBS: Blue Marble Next Generation, VIIRS Black Marble | Day and night Earth textures for the 3D globe |
| NASA POWER (MERRA-2) | Daily rainfall at Chattogram to explain the monsoon context |

Other sources: division boundary from Bangladesh Bureau of Statistics / HDX via geoBoundaries (CC BY 3.0 IGO); basemap
from Mapbox Standard.

## Use of AI

- **Case assistant (in the product):** Google Gemini (`gemini-3.5-flash`, fallback `gemini-3.8-flash`) with function
  calling over read-only tools on the published case data ([backend/app/assistant.py](backend/app/assistant.py)). It
  can only read case facts and move the map; it cannot change data.
- **Development:** AI coding assistants (Claude Code) helped write and review code and documentation. The team chose the
  study area, the case, the method and every claim, and checked the results against the NASA source files.

## Run it locally

Requirements: Node.js 20+, pnpm, Python 3.11+ (backend only), a public Mapbox token.

```bash
pnpm install
echo "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_public_token" > .env.local
pnpm dev            # http://localhost:3000, uses the frozen case if no backend is running
```

Backend (optional, for live search and processing): see [backend/README.md](backend/README.md).

| Command | What it does |
| --- | --- |
| `pnpm build` | Production build |
| `pnpm lint` / `pnpm test` | Lint and frontend tests |
| `pnpm freeze-case` | Refresh the frozen case snapshot (needs the backend) |
| `pnpm fetch-rain` | Refresh NASA POWER rainfall |

Set `NEXT_PUBLIC_CASE_SOURCE=frozen` to deploy without a backend.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app` | Landing page (`/`) and the Chattogram case (`/chattogram`, tour, map, compare, evidence) |
| `src/components` | Maps, globe, 3D views, tour and assistant UI |
| `backend/` | FastAPI API, NISAR processing worker, case assistant |
| `public/data/chattogram/` | Frozen case snapshot and rainfall |
| `docs/` | [Case study](docs/CHATTOGRAM.md), [curated case](docs/curated-case.md), [explorer notes](docs/EXPLORER.md), [Mapbox setup](docs/MAPBOX.md) |

## Team

Team CryoCore Horizon, Bangladesh.

| Name | Role |
| --- | --- |
| _add each member_ | _role_ |

## Limitations

- One processed pair; terrain-quality checks and field validation are still pending.
- NISAR GCOV data is a provisional collection.
- Radar change is evidence to check on the ground, not a confirmed flood or crop map.

## References and credits

- NISAR data: NASA and ISRO, distributed by the [Alaska Satellite Facility DAAC](https://asf.alaska.edu/).
- [NASA Earthdata CMR](https://cmr.earthdata.nasa.gov/), [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api),
  [NASA POWER](https://power.larc.nasa.gov/).
- Boundary: [geoBoundaries](https://www.geoboundaries.org/) (BBS / HDX), CC BY 3.0 IGO.
- Libraries: Next.js, React, Mapbox GL JS, react-map-gl, three.js, Motion, lucide-react, Tailwind CSS, FastAPI, h5py,
  NumPy, SciPy, rasterio, pyproj, Shapely, Pillow.

This is not an official NASA or ISRO website.

## License

[MIT](LICENSE). Data keeps the licence of its source.
