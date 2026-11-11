"use client";

import Link from "next/link";
import { useCase } from "../CaseProvider";
import { ChangeKey, WaterKey } from "../MapKey";

export function AboutView() {
  const { load } = useCase();
  const region = load.status === "ready" ? load.data.region : null;
  const n = load.status === "ready" ? load.data.acquisitions.length : 0;

  return (
    <article className="c-doc">
      <h1>About this case</h1>
      <p className="c-lede">
        Where did surface-water conditions change around Chattogram, and how can we tell? NISAR’s L-band radar sees the ground through monsoon cloud, day or
        night. This app lines up its acquisitions over the same place so changes between dates can be inspected, with the evidence and its limits in view.
      </p>

      <h2>What is real here</h2>
      <ul>
        <li>
          <strong>Acquisitions.</strong> {n ? `${n} NISAR GCOV scenes` : "NISAR GCOV scenes"} found through NASA Earthdata CMR and stored by our backend, with
          their dates, tracks, frames, polarizations, product versions and footprints exactly as NASA publishes them.
        </li>
        <li>
          <strong>Radar images.</strong> The pictures are the browse quicklooks that come with each NISAR product (an RGB composite of polarizations), served
          by the Alaska Satellite Facility. They are for looking, not measuring: they are not calibrated backscatter.
        </li>
      </ul>

      <h2>What is not done yet</h2>
      <ul>
        <li>Calibrated backscatter (γ⁰ in dB), quality masks and a common grid from the full GCOV files: the processing worker is next on the backend.</li>
        <li>Signed backscatter change and any water classification. Until reference checks support it, a change is “observed radar change”, never a flood.</li>
        <li>Area statistics. They need the verified division boundary and an equal-area projection.</li>
      </ul>

      <h2>How processed results will look</h2>
      <p>
        Water-change candidates and signed backscatter change are separate layers with separate legends, never shown together, so a measured change is
        never mistaken for a classification.
      </p>
      <div className="c-keys">
        <WaterKey />
        <ChangeKey />
      </div>

      {region && (
        <>
          <h2>Study area</h2>
          <p>
            {region.name}, {region.country}. The box {region.bbox.join(", ")} ({region.crs}) is a search envelope, not a boundary: {region.boundary_note}
          </p>
        </>
      )}

      <h2>Sources</h2>
      <ul>
        <li>
          NISAR data: NASA and ISRO, distributed by the <a href="https://nisar-docs.asf.alaska.edu/">Alaska Satellite Facility DAAC</a>, discovered through{" "}
          <a href="https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html">NASA CMR</a>.
        </li>
        <li>
          Basemap: <a href="https://openfreemap.org/">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.
        </li>
      </ul>

      <p className="c-aside">
        The earlier Jakobshavn Glacier dashboard runs on synthetic sample data and is kept separate: <Link href="/dashboard">open the glacier sample</Link>.
      </p>
    </article>
  );
}
