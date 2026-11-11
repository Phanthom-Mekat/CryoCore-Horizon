"use client";

import { BookOpen, Database, FlaskConical, Terminal } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { Card, PageHead } from "../ui";
import { fmtDay } from "@/lib/dashboard-data";

const STEPS = [
  { cmd: "python scripts/nisar_pipeline.py search --start 2025-10-01", what: "Lists NISAR GCOV (backscatter) and GOFF (pixel offsets) files over the glacier from the Alaska Satellite Facility. Track 170, frame 53 by default." },
  { cmd: "python scripts/nisar_pipeline.py download", what: "Downloads them with your NASA Earthdata login (about 31 GB for the 2025–26 record)." },
  { cmd: "python scripts/nisar_pipeline.py inspect data/raw/<GOFF file>.h5", what: "Prints the layers inside one offsets file, to confirm the names before building." },
  { cmd: "python scripts/nisar_pipeline.py build", what: "Writes the speed grids, radar previews, front picks and time series this dashboard reads." },
];

export function MethodsView() {
  const { manifest } = useDashboard();
  return (
    <>
      <PageHead crumbs={["Data and methods"]} />
      <div className="d-grid d-grid-1-1">
        <Card title="What you are looking at" icon={Database}>
          <dl className="d-specs">
            <div>
              <dt>Status</dt>
              <dd>{manifest.sample ? <span className="d-pill is-warn">Sample data</span> : <span className="d-pill is-ok">Real NISAR data</span>}</dd>
            </div>
            <div>
              <dt>Glacier</dt>
              <dd>{manifest.glacier}</dd>
            </div>
            <div>
              <dt>Record</dt>
              <dd>
                {fmtDay(manifest.passes[0].date)} to {fmtDay(manifest.passes[manifest.passes.length - 1].date)}
              </dd>
            </div>
            <div>
              <dt>Geometry</dt>
              <dd>
                Track {manifest.passes[0].track}, frame {manifest.passes[0].frame}, {manifest.passes[0].direction === "A" ? "ascending" : "descending"}
              </dd>
            </div>
            <div>
              <dt>Speed grid</dt>
              <dd>
                {manifest.grid.width} × {manifest.grid.height} cells, about 300 m each
              </dd>
            </div>
            <div>
              <dt>Basemap</dt>
              <dd>{manifest.basemap.caption}</dd>
            </div>
          </dl>
          {manifest.sample && <p className="d-note">{manifest.note}</p>}
        </Card>
        <Card title="How the numbers are made" icon={FlaskConical}>
          <ul className="d-bullets">
            <li>
              <strong>Ice speed</strong> comes from NISAR GOFF products: the shift of each 80 m patch of ice between two passes 12 days apart, divided by the
              time between them.
            </li>
            <li>
              <strong>Simplification:</strong> speed is the 2-D size of the offsets, with the slant-range part projected to the ground using the incidence
              angle. It is not a full 3-D velocity.
            </li>
            <li>
              <strong>Calving front</strong> is picked along one flowline as the strongest step from dark mélange to bright glacier ice in the L-band image.
              It tracks advance and retreat, not the full outline.
            </li>
            <li>
              <strong>Probe points</strong> average a 3 × 3 block of cells (about 900 m) to steady the readings.
            </li>
          </ul>
        </Card>
      </div>
      <Card title="Rebuild the data" icon={Terminal} sub="Run these at the hackathon to replace the sample data with real NISAR measurements">
        <ol className="d-steps">
          {STEPS.map((s) => (
            <li key={s.cmd}>
              <code>{s.cmd}</code>
              <p>{s.what}</p>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Sources" icon={BookOpen}>
        <ul className="d-bullets">
          <li>
            NISAR data: NASA and ISRO, distributed by the <a href="https://nisar-docs.asf.alaska.edu/">Alaska Satellite Facility DAAC</a>.
          </li>
          <li>
            Basemap: Sentinel-2 through NASA Harmonized Landsat Sentinel-2 (HLS), served by <a href="https://gibs.earthdata.nasa.gov/">NASA GIBS</a>.
          </li>
          <li>
            Glacier facts: <a href="https://whc.unesco.org/en/list/1149/">UNESCO World Heritage Centre, Ilulissat Icefjord</a>.
          </li>
        </ul>
      </Card>
    </>
  );
}
