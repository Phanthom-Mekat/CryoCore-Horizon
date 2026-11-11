"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useCase } from "../CaseProvider";
import { ChangeKey, WaterKey } from "../MapKey";

export function AboutView() {
  const { load, explorer } = useCase();
  const region = explorer?.region;
  const n = load.status === "ready" ? load.data.acquisitions.length : 0;

  return (
    <article className="c-doc">
      <p className="c-eyebrow">About this case</p>
      <h1>Chattogram, through the clouds</h1>
      <p className="c-lede">
        Where did surface-water conditions change around Chattogram, and how can we tell? NISAR’s L-band radar sees the ground through monsoon cloud, day or
        night. This app lines up its acquisitions over the same place so the changes between dates can be inspected, with the evidence and its limits in
        view.
      </p>

      <h2>What is real here</h2>
      <ul>
        <li>
          <strong>Acquisitions.</strong> {n ? `${n} NISAR GCOV scenes` : "NISAR GCOV scenes"} that intersect the division, found through NASA Earthdata CMR and
          stored by our backend, with dates, tracks, frames, polarizations, product versions and footprints exactly as NASA publishes them.
        </li>
        <li>
          <strong>Radar images.</strong> The browse quicklooks that come with each NISAR product (a colour composite of polarizations), served by the Alaska
          Satellite Facility. For looking, not measuring: they are not calibrated backscatter.
        </li>
        {region && (
          <li>
            <strong>Division boundary.</strong> The {region.provenance.year} reference boundary from {region.provenance.source}. {region.provenance.note}
          </li>
        )}
      </ul>

      <h2>What is not done yet</h2>
      <ul>
        <li>Calibrated backscatter (γ⁰ in dB), quality masks and a common grid from the full GCOV files: the processing worker is next on the backend.</li>
        <li>Signed backscatter change and any water classification. Until reference checks support it, a change is “observed radar change”, never a flood.</li>
        <li>Area statistics. They need the boundary’s suitability confirmed and an equal-area projection.</li>
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

      <h2>Sources</h2>
      <ul>
        <li>
          NISAR data: NASA and ISRO, distributed by the{" "}
          <a href="https://nisar-docs.asf.alaska.edu/gcov/" target="_blank" rel="noreferrer">
            Alaska Satellite Facility DAAC <ExternalLink size={12} aria-hidden="true" />
          </a>
          , discovered through{" "}
          <a href="https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html" target="_blank" rel="noreferrer">
            NASA CMR <ExternalLink size={12} aria-hidden="true" />
          </a>
          .
        </li>
        {region && (
          <li>
            Boundary:{" "}
            <a href={region.provenance.source_url} target="_blank" rel="noreferrer">
              {region.provenance.source} <ExternalLink size={12} aria-hidden="true" />
            </a>
            , licence{" "}
            <a href={region.provenance.license_url} target="_blank" rel="noreferrer">
              {region.provenance.license} <ExternalLink size={12} aria-hidden="true" />
            </a>
            . SHA-256 <span className="c-mono c-hash">{region.provenance.sha256}</span>
          </li>
        )}
        <li>
          Basemaps: <a href="https://openfreemap.org/">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>; NASA
          GIBS Blue Marble in the scene catalogue (static context, not NISAR).
        </li>
      </ul>

      <p className="c-aside">
        The Jakobshavn Glacier pages run on synthetic sample data and are kept separate from this case: <Link href="/dashboard">open the glacier sample</Link>.
      </p>
    </article>
  );
}
