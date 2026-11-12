# The Chattogram case in the frontend

One case study, one journey, in the shared dashboard shell (`src/components/dashboard/Shell.tsx`). The sidebar keeps it
apart from the Jakobshavn sample: **Chattogram · NISAR** is tagged *Real data*, **Jakobshavn · glacier** *Sample*.

| Page | Route | What it answers |
| --- | --- | --- |
| Overview | `/chattogram` | The question, the case in numbers, how to read it, and a comparison to start with |
| Explore map | `/chattogram/explore` | What NISAR saw on each pass: browse quicklooks on the map, the division outline, a date timeline with replay |
| Compare dates | `/chattogram/compare` | What changed between two passes of the same orbit, and whether the two dates are fair to compare |
| Evidence & brief | `/chattogram/evidence` | Where every picture comes from, what is measured vs interpreted, and an exportable brief (JSON, CSV, GeoJSON, print) |
| Scene catalogue | `/chattogram/catalogue` | Every stored scene over the division, NASA discovery search, and a link to open any scene on the map |
| About & sources | `/chattogram/about` | Sources, licences, limitations, and legends |
| Calibrated radar | `/chattogram/processed` | Real HH/HV pilot, synchronized comparison, signed dB change, 3D terrain context, coverage and downloads |

## Data flow

The browser only talks to the Next.js app. Server routes proxy the backend (`src/lib/backend-proxy.ts`):

- `/api/earth/explorer` → `GET /api/v1/explorer`: division boundary with provenance, intersecting footprints, counts.
- `/api/earth/scenes` → `GET /api/v1/scenes`: full CMR metadata for each stored scene.
- `/api/earth/search` → `POST /api/v1/nasa/search`: NASA discovery from the catalogue page.
- `/api/nisar-browse`: fetches a scene's NISAR browse quicklook from ASF by granule ID (never a raw URL), makes its
  declared no-data transparent, and returns its corners: from ASF's public KML, or for provisional products derived
  from the image's valid-data extent and the CMR footprint (checked against a public KML to about one pixel).

`CaseProvider` loads the first two once for every page, keeps only scenes that intersect the division polygon, groups
them into stacks (same track, frame and direction), and keeps the selection (stack, before/after dates, map view,
selected scene) in the URL, so every view can be shared as a link.

## Honesty rules the UI follows

- Quicklooks are labelled as browse images, never as calibrated backscatter.
- Before two dates are compared, their geometry, polarizations, data maturity (from the CMR collection name) and product
  version are checked, and any difference is shown. The default pair is the widest-spaced one that passes all four.
- Until the processing worker publishes results, every difference is called observed radar change, not water change.
