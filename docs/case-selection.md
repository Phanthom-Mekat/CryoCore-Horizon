# Chattogram NISAR candidate — inspection record

Verified 12 November 2026. This is a candidate for observed radar-change analysis,
not a confirmed flood case. Gate A remains open until a small analysis polygon,
valid common pixels, mixed-mode implications and dated references are evaluated.

## Selected acquisitions

| Field | Before | After |
| --- | --- | --- |
| NASA CMR concept | G4241673561-ASF | G4362350526-ASF |
| Acquisition UTC | 2026-07-07 12:26:37 | 2026-10-11 12:26:35 |
| Raw file bytes | 8,321,499,136 | 8,141,144,064 |
| CMR revision | 1 | 1 |
| Product/version | GCOV 1.0.11 | GCOV 1.0.11 |
| Collection maturity | PROVISIONAL_V1 | PROVISIONAL_V1 |
| Product specification | 1.5.0 | 1.5.0 |
| Track/frame | 163 / 77 | 163 / 77 |
| Pass/look | Descending / Left | Descending / Left |
| Frequency A | 20 MHz; HH/HV/VH/VV | 20 MHz; HH/HV/VH/VV |
| Frequency B | 5 MHz; HH/HV | 5 MHz; HH/HV |

Both HDF5 files were opened remotely using authenticated range requests; each
inspection transferred 3,670,016 bytes. Reports are stored by concept/revision in
SQLite and available through `/api/v1/scenes/{concept_id}/inspection`.

Frequency A has matching 16,884 × 17,208 grids, 20 m spacing, EPSG:32646,
and matching coordinate endpoints: x 309610 to 653750, y 2687030 to 2349370.
HHHH/HVHV and mask/exception-mask dimensions match. This establishes a metadata
candidate, not valid coverage or scientific comparability.

Frequency B has 4,221 × 4,302 imagery at 80 m, but its inputDataExceptionMask is
16,884 × 17,208 in **both** files. The assessment excludes B until its semantics
and alignment are resolved. It does not silently resize a quality mask.
Both files report `isMixedMode=True`; this needs further processing-metadata review.

## Alternatives and limits

The inspected 4 November file (G4405731724-ASF) is version 1.0.20/specification
1.6.0 in a different maturity collection, so it is not substituted into this
provisional pair. The 23 October acquisition has different frequency-A bandwidth
and polarizations from 4 November; adjacent dates alone are insufficient.

CMR footprints overlap inside the reference Chattogram division boundary. A
smaller analysis polygon has not yet been selected. The reference boundary is
2018 BBS/HDX via geoBoundaries; current suitability remains unverified.

Seasonal vegetation, soil moisture, tidal/coastal water, speckle, terrain,
mixed acquisition modes and provisional calibration may affect the comparison.
No dated independent labels or event attribution have been established. The
defensible next output is masked, calibrated **observed radar change**. Flood,
damage and classification accuracy claims remain unsupported.

## Storage and processing budget

The pair totals 16,462,643,200 bytes (15.33 GiB) raw. Reserve 40 GiB of free disk
before full preparation: about 16 GiB for raw assets and 24 GiB for derived layers,
temporary outputs and headroom. Initial processing should use a small window
and bounded chunks, not load two whole covariance products into RAM. The actual
subset and derived-output budget will be recorded before raster processing.

Full raw downloads have **not** completed. A bounded live resume test fetched
4 MiB then resumed to 8 MiB of the October file. Full integrity verification is
pending for these NASA files; checksum success/failure and atomic publication
have been tested using controlled fixtures.

## Reproduce

From `backend/`, with `EARTHDATA_TOKEN` in its ignored `.env`:

```powershell
.\.venv\Scripts\python.exe -m app.prepare G4241673561-ASF
.\.venv\Scripts\python.exe -m app.prepare G4362350526-ASF
.\.venv\Scripts\python.exe -m app.prepare G4362350526-ASF --download --transfer-mib 64
```

Rerun the download command to resume. It pauses at the transfer budget and never
publishes `.part` data as complete. Use the read-only pair gate:
`GET /api/v1/pairs/assess?before=G4241673561-ASF&after=G4362350526-ASF`.

Source interpretation: [ASF GCOV product guide](https://nisar-docs.asf.alaska.edu/gcov/).
The real file metadata, rather than browse-image appearance, drives these checks.

## Real calibrated-window result

Pilot `6573c8bc5837ede3c0541563` was generated from actual frequency-A HDF5
pixels, transferring 9,699,328 bytes per scene. The 256×256 window is centered
near 91.845 E, 22.33 N; projected EPSG:32646 bounds are
`[378480, 2467260, 383600, 2472380]`. At 20 m spacing its rectangular area is
26.2144 km². Boundary and footprint clipping retains 54,538 pixels (21.8152 km²)
and excludes 10,998 pixels (4.3992 km²). All retained pixels pass the applied
subswath/exception/power checks in both dates and both polarizations.

The river corridor visible in the preview is excluded by this geographic clipping.
This is a **land-area radar-change pilot**, not evidence of river-water change.
The reference boundary needs suitability review before choosing a water-focused ROI.

The actual mask descriptions require fully-focused samples (subswath codes
1 through numberOfSubSwaths); 0 denotes invalid/partially focused samples and
255 denotes outside-acquisition samples. Input exception code zero means no
anomaly. The method additionally requires finite positive power. These checks do
not establish terrain-quality validity: static layover/shadow masks remain pending.

Eight GeoTIFFs preserve the native projected grid without resampling. HH/HV
backscatter uses `10*log10(power)`; signed change is October minus July over
common-valid pixels only. Median HH change is −0.69572 dB (5th/95th percentiles
−5.21238/+4.03985 dB); median HV change is −0.54562 dB (−4.89148/+4.00449 dB).
These statistics describe this clipped window, not the division as a whole.
No smoothing, threshold classifier, independent validation or causal attribution
has been applied. Provisional calibration and mixed-mode flags remain caveats.

The manifest records inputs, mask descriptions, projected area, exclusions,
ETags, method version and SHA-256 of each output. Full raw-file checksums remain
unverified because only selected chunks were downloaded. All eight output hashes,
CRS/grid transforms, counts, no-data pixels and delta arithmetic were verified.

Run `python -m app.subset` from the backend virtual environment to reproduce.
Inspect the published manifest at `/api/v1/cases/6573c8bc5837ede3c0541563`.
The processed pilot is available at `/chattogram/processed`, alongside the broader browse-quicklook explorer.
