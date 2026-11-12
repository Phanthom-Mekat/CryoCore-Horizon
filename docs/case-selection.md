# Case selection: `karnaphuli-estuary`

Selected 12 November 2026 from NASA CMR metadata synced into the local catalog
(`python -m app.cli sync --start 2026-01-01 --end 2026-11-12`: 181 GCOV records, 128 intersecting the division polygon).
Every value below comes from that metadata. **No NISAR file has been opened yet** (no Earthdata credentials on the
selection machine), so Gate A's "inspect real files" step is still open; see [What is still unverified](#what-is-still-unverified).

## Chosen area

| | |
| --- | --- |
| Name | Lower Karnaphuli river and Chattogram port |
| Geometry | Rectangle lon 91.79–91.90 E, lat 22.24–22.38 N (EPSG:4326), in `backend/app/assets/analysis-areas.geojson` |
| Provenance | Team-drawn analysis rectangle, **not an administrative boundary** |
| Area | About 175.7 km² (EPSG:6933 equal-area) |
| Coverage | Inside the footprint of all 11 dated acquisitions of stack `069_A_013` and all 11 of `163_D_077` |

**Relation to the division polygon.** The 2018 BBS/HDX division polygon leaves out the Karnaphuli channel itself. About
16.7 km² of the rectangle, the river channel and its mouth, is therefore outside that polygon, although it lies between division
land on both banks. A rectangle wholly inside the polygon would have to drop the river, which is the reason for choosing this
area. The west edge (91.79 E) is placed so that, apart from the river mouth, the rectangle keeps off the open Bay of Bengal
(the coast at Patenga is at about 91.776–91.789 E between 22.24 and 22.26 N).

The rectangle replaces the approximate brief (lon 91.75–91.90, lat 22.20–22.38), which was 21.5% outside the polygon,
mostly open sea west of Patenga and south of the river mouth.

## Chosen pair

The frontend picks the default pair automatically (`src/lib/chattogram/acquisitions.ts`, `CaseProvider.tsx`). It
takes the stacks covering Chattogram city, sorted by number of dates and then by stack id. In the first stack it chooses
the widest-spaced pair of dates that passes all four checks: same track, frame and direction; same polarizations; same
collection (maturity); same product version.
Stacks `069_A_013` and `163_D_077` both have 11 dates, so `069_A_013` comes first on the id sort. All 11 of its footprints
contain the rectangle, so the case uses that default pair:

| | Before | After |
| --- | --- | --- |
| Granule | `NISAR_L2_PR_GCOV_023_069_A_013_4005_DHDH_A_20260618T232102_20260618T232136_P05023_N_F_J_001` | `NISAR_L2_PR_GCOV_033_069_A_013_4005_DHDH_A_20261016T232058_20261016T232133_P05023_N_F_J_001` |
| CMR concept | `G4240317293-ASF` (revision 1) | `G4376150332-ASF` (revision 1) |
| Acquired (UTC) | 2026-06-18 23:21:02 | 2026-10-16 23:20:58 |
| Local time (UTC+6) | 19 Jun 2026, 05:21 | 17 Oct 2026, 05:20 |
| Track / frame / pass | 69 / 13 / ascending | 69 / 13 / ascending |
| Frequencies; A polarizations | A, B; HH + HV | A, B; HH + HV |
| Collection / version | `NISAR_L2_GCOV_PROVISIONAL_V1` / 1.0.11 | `NISAR_L2_GCOV_PROVISIONAL_V1` / 1.0.11 |
| HDF5 size | 6,136,266,752 bytes (6.1 GB) | 6,253,707,264 bytes (6.3 GB) |
| MD5 (CMR) | `a52536ee1ab75b4267b4cf74871ff22f` | `898782011736a8ea15df9d361170a71e` |

Separation: 120 days, from the early monsoon to its end.
Storage budget: 12.4 GB of raw downloads (kept in `backend/data/raw/`, never committed), plus a bundle of a few MB.
Before starting, the worker checks free disk space against the CMR file sizes.

The case pins these concept IDs. If new acquisitions later change the frontend's default stack or pair, the case stays the same.
In that event, update this document and `analysis-areas.geojson` together.

## Rejected alternatives

- **Stack `163_D_077`, 7 Jul vs 11 Oct 2026** (the earlier candidate in the plan). It is the widest compatible pair in that stack:
  both dates are quad-pol (HH+HV+VH+VV), provisional and version 1.0.11. The 7 Jul file alone is 8.3 GB. Its footprints also cover the rectangle. It was not
  chosen, because the rule is to follow the frontend default, so that the case and the default comparison show the same dates.
  It remains the best second pair, with a descending pass, opposite look geometry and more polarizations.
- **Pairs that include 9 Nov 2026 (`069_A_013`) or 23 Oct / 4 Nov 2026 (`163_D_077`).** These are in `NISAR_L2_GCOV_V1` at
  product version 1.0.20, a different collection and version from the provisional 1.0.11 dates. Comparing across them would
  mix processing changes with surface change.
- **Stack `091_D_077`.** It covers the city but none of its 8 footprints contains the rectangle. Its dates also mix HH+HV,
  VH+VV and quad-pol acquisitions.
- **Feni–Muhuri and the lower Sangu corridor** (candidates in the plan) were not evaluated in this pass. The Karnaphuli is
  where the most compatible dates overlap, and it is the area the frontend already centres on.

## Known confounders

What can change L-band backscatter between these two dates other than the surface water we would like to talk about:

- **Tide.** The lower Karnaphuli and the port are macro-tidal (range of several metres at springs). The two passes were
  at about 05:20 local time on different days, so their tidal states are unrelated. Intertidal mud, channel margins and
  char banks can be exposed on one date and submerged on the other. Tide heights for both times have not been obtained.
- **Wet soil and rain.** June is early monsoon, mid-October is late monsoon. Soil moisture raises backscatter over
  bare and cultivated land, independently of any standing water.
- **Vegetation phenology.** Aman rice is transplanted around July–August and is near maturity in October. Crop growth
  alone can change HH and especially HV by several dB. Mangrove and homestead vegetation change less.
- **Built-up areas and ships.** Port cranes, container stacks, moored ships and buildings cause strong double-bounce
  returns. Ship positions change between passes and look like point-like "change" on the water.
- **Layover and shadow.** Mostly flat terrain, but the Chattogram hill tracts and the city ridges in the north-east can
  have layover or shadow. The GCOV mask should flag those pixels, which must be excluded, not interpreted.
- **Speckle.** Single-date GCOV backscatter is speckled. Change is computed on filtered values, and small isolated regions
  are dropped. Even so, a few-dB change in a single pixel is not evidence.
- **Wind on water.** Open water is dark only when calm. Wind roughening on the river or the bay raises its backscatter,
  which can hide water or create apparent change.
- **Provisional calibration.** Both products are labelled *provisional*. Absolute calibration can change in later
  releases. Both dates share the same version, so the difference between them is more robust than either absolute value.

## The claim the data can support

> Between 18 June and 16 October 2026 (UTC), NISAR L-band GCOV backscatter over [valid common area] of the
> lower Karnaphuli rectangle increased by more than [threshold] dB over [X km²] and decreased over [Y km²].

This is **observed radar change**. It is not flooding, not a water-extent change and not damage. No independent reference
observation (tide gauge record, optical imagery, field report) has been checked against it. Any statement about water
needs a separately versioned water method and reference checks (plan, Gates B and C). Until then the product and the
video say "observed radar change", and they report the excluded area with every number.

## What is still unverified

- The HDF5 layout, masks and per-file metadata (Gate A, "inspect real files"). This needs NASA Earthdata credentials:
  `CRYO_EARTHDATA_TOKEN` in `backend/.env`, then `python -m app.cli prepare-case karnaphuli-estuary`.
- That the valid-data mask leaves enough common coverage inside the rectangle. The worker fails the job with a plain
  message if it does not.
- Tide heights at both acquisition times. Reference observations for any later water interpretation.
