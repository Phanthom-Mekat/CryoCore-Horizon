# Shared Chattogram data

This curated bundle is checked into Git so collaborators can run the calibrated
radar page without downloading the source granules or supplying Earthdata credentials.
After pulling, install backend dependencies and start the backend and frontend
as described in `../README.md`. Open `/chattogram/processed`. Mapbox basemaps still
require each developer's own `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`.

## Included

- `cases/6573c8bc5837ede3c0541563/`: eight native 20 m GeoTIFFs (HH/HV before,
  after, signed dB change and common-valid masks), plus the provenance manifest.
  Approximately 1.2 MB. SHA-256 hashes and byte counts are in the manifest.
- `inspection-july.json` and `inspection-october.json`: source HDF5 metadata
  inspections. These are metadata records, not complete raw satellite files.
- `bgd-adm1.geojson`: downloaded Bangladesh division reference boundaries,
  approximately 12 MB. The backend uses the extracted Chattogram feature already
  tracked at `../app/assets/chattogram.geojson`.

## Sources and attribution

Radar: NASA–ISRO NISAR, distributed by the Alaska Satellite Facility DAAC.
The provisional GCOV acquisitions are 7 July and 11 October 2026, track 163,
frame 77. Exact granule IDs, revisions, processing method, source metadata and
limitations are recorded in the case manifest. See https://nisar.asf.alaska.edu/.
The derived rasters are our small processed subset, not complete source products;
full source-file checksums have not been verified. Reprocessing or fetching new
granules requires your own Earthdata credentials.

Boundary: Bangladesh Bureau of Statistics / HDX, distributed through
geoBoundaries gbHumanitarian, 2018 reference, CC BY 3.0 IGO:
https://data.humdata.org/dataset/cod-ab-bgd and
https://creativecommons.org/licenses/by/3.0/igo/.
The exact download URL and extracted Chattogram feature checksum are recorded
in the case manifest. The full Bangladesh file bundled here has SHA-256
`673afd9b39de3fd238beaa9a5c3b93bc5f693a5b7b5bfac23dff1558d9ab6e83`.
This is not verified as the current legal boundary.

The pilot measures backscatter change, not flooding or damage. Geographic
clipping excludes the river corridor. Terrain quality, mixed-mode implications
and independent dated reference validation remain unresolved.

SQLite databases, test output, partial downloads, locks and credentials remain
ignored. Each checkout creates its own database; populate the discovery catalogue
using the documented NASA search endpoint. The bundled processed case works
independently of those catalogue records. Future generated cases remain ignored
until explicitly reviewed and added to the allowlist.
