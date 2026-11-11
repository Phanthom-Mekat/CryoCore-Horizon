# Feature 01: Chattogram observation explorer

Now the **Scene catalogue** page of the Chattogram case: `/chattogram/catalogue` (the old `/explore` redirects there).
This is the discovery portion of roadmap F01/F02, not a finished environmental analysis or validated before/after pair.
How it fits with the radar map, Compare and Evidence pages: [CHATTOGRAM.md](CHATTOGRAM.md).

The explorer shares the existing dashboard `Shell`, navigation, `PageHead`,
`KpiStrip`, and `Kpi` components. Both workspaces inherit the same navy surfaces,
ice-blue accents, typography, and controls. `BrandMark` is also shared with the
landing page. Explorer CSS is limited to its map, timeline, and scene-review layout;
it must use the existing design tokens instead of introducing another visual theme.

## User journey

1. Open `/chattogram/catalogue` with the backend running. Stored real NASA records load from SQLite.
2. Inspect the division outline and catalog footprints. “Fit division” resets the
   camera; “Tilt view” changes the viewing angle, not the terrain elevation.
3. Click a timeline bar to filter by an actual acquisition date. Bar spacing is
   categorical, and height is the number of records, not a surface measurement.
4. Select a scene from the list or map. Review track, frame, polarization, source
   revision, calibration maturity if present, and the original NASA metadata link.
5. Discover additional GCOV records using the date form. Each page is bounded to
   100 records. “Load next page” uses the original search dates. Searching adds
   to the local catalog; the map continues to show stored records across all dates.

The list works independently of map selection. Empty, offline, partial catalog,
upstream failure, missing-geometry, and no-intersection states are distinguished.

## Library decisions

| Library | Decision | Reason |
| --- | --- | --- |
| [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) | Installed, version 5 line | WebGL geospatial layers, camera tilt, navigation, accurate raster/GeoJSON overlay; version 5 avoids a separate worker configuration in this Next.js integration |
| [react-map-gl](https://visgl.github.io/react-map-gl/docs/get-started) | Installed | Typed React source/layer components and clean map lifecycle |
| [Motion](https://motion.dev/docs/react-animate-presence) | Installed | Short evidence-panel transitions with reduced-motion support |
| [deck.gl](https://deck.gl/docs) | Evaluated, deferred | Useful for large GPU-driven datasets; unnecessary for this scene count |
| [CesiumJS](https://cesium.com/platform/cesiumjs) | Evaluated, deferred | Strong global 3D/terrain capabilities, but not needed for this focused 2D geospatial review |
| Three.js | Existing dependency retained | The original hero already uses it; it does not drive scientific map coordinates |

Node dependencies use pnpm and `pnpm-lock.yaml`. The explorer map is dynamically
loaded only in the browser. No fake satellite model, generated flood layer, or
animated radar sweep is presented as real data.

## Data provenance

**NISAR:** public NASA Earthdata CMR GCOV metadata distributed by ASF DAAC.
Full records and retrieval times are stored in the ignored local SQLite database.
Footprints are converted from UMM polygons/rectangles to GeoJSON. Invalid or absent
geometry is excluded and counted. Polygon holes are preserved. No-data masks,
image pixels, and full usable scene coverage cannot be inferred from these extents.

**Boundary:** Bangladesh Bureau of Statistics / HDX, via geoBoundaries
`gbHumanitarian`, release commit `9469f09`, dataset `BGD-ADM1-88445334`, reference
year **2018**. Source feature name: **Chittagong**. License: **CC BY 3.0 IGO**.
This is a sourced reference boundary, not verified as the current legal boundary.

The original division feature is packaged in `backend/app/assets/chattogram.geojson`;
`boundary-source.json` records the download URL, timestamp, license, and SHA-256.
Map geometry is simplified with a topology-preserving 0.001-degree tolerance.
Spatial intersection uses the original geometry. No area statistics are computed.
Regenerate with `python scripts/prepare_boundary.py` from `backend/`.

- Source: <https://data.humdata.org/dataset/cod-ab-bgd>
- Distributor metadata: <https://www.geoboundaries.org/api/current/gbHumanitarian/BGD/ADM1/>
- License: <https://creativecommons.org/licenses/by/3.0/igo/>

**Basemap:** NASA GIBS `BlueMarble_ShadedRelief_Bathymetry`, WMTS EPSG:3857,
`GoogleMapsCompatible_Level8`. Static contextual imagery, not current conditions
or NISAR radar imagery. Native maximum tile zoom is 8; higher map zoom overzooms it.
Layer URL verified against GIBS capabilities. Initial CARTO tiles displayed a key
requirement during QA and were replaced with this public NASA service.

- [NASA GIBS map-library guidance](https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/)

## Backend contract

`GET /api/v1/explorer?product=GCOV&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

Returns the simplified display boundary and provenance, intersecting scene
GeoJSON, counts, per-day histogram, and interpretation notice. Optional dates
filter the stored catalog. It does not make a NASA request or download rasters.

Existing `POST /api/v1/nasa/search` discovers and saves one page. Its search envelope
is deliberately broad; the explorer applies exact polygon intersection afterward.
The two Next.js proxy routes explicitly expose these two operations only. Configure
`BACKEND_URL` server-side. Requests time out and return a useful backend-unavailable
error. The development application is not intended for unauthenticated public deployment.

## Verification and boundaries of this increment

- Live discovery for 1 October 2025–12 November 2026 returned 178 GCOV records;
  125 intersected the reference division across 44 acquisition days, 53 were outside,
  and none lacked usable geometry in that retrieval. This is a dated catalog result,
  not a guaranteed ongoing count or a count of unique satellite passes.
- Backend checks cover source checksum, city containment, excluded/invalid geometry,
  polygon holes, date validation, empty response, and the original API suite.
- Production build and TypeScript checks are required before handoff.
- Verified this increment: 17 backend tests pass; `pnpm build` passes. Browser
  checks confirmed a date reduces the list to three matching scenes, scene
  selection opens its evidence panel, tilt/reset works, and real NASA pagination
  progresses from 100/178 to 178/178. A 390-pixel viewport has no horizontal overflow.
- Fixed a development-time vendor CSS collision by excluding foreign
  (`node_modules`) files from the Tailwind Turbopack loader. MapLibre's stylesheet
  is imported at the route level so controls and canvas positioning load reliably.
- The original glacier landing page/dashboard remains separate. The main navigation
  now links to the Chattogram explorer; a full landing-page rewrite is deferred.

Next increment: select a small candidate area and compatible pair, then add a
download/inspection workflow. That may require the user's NASA Earthdata login.
Do not send credentials in chat; configure them locally when that workflow is implemented.
