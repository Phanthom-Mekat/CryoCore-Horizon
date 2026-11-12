"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useCase } from "../CaseProvider";
import { ChangeKey, FindingKey, WaterKey } from "../MapKey";
import { PrepStatus } from "../PrepStatus";

export function AboutView() {
  const { load, explorer, processed } = useCase();
  const ready = processed.status === "ready" && processed.data.detail.status === "ready";
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

      <h2>Data preparation</h2>
      <div className="c-ev-card">
        <PrepStatus />
      </div>

      <h2>What is not done yet</h2>
      <ul>
        {!ready && (
          <li>Calibrated backscatter (γ⁰ in dB), quality masks and a common grid from the full GCOV files, for the processed case’s pair.</li>
        )}
        <li>Any water classification. Until reference checks support it, a change is “observed radar change”, never a flood.</li>
        <li>Division-wide statistics. Areas are only given inside the team-drawn analysis rectangle, which is not an administrative boundary.</li>
      </ul>

      <h2>How processed results look</h2>
      <p>
        Signed backscatter change has its own diverging scale; areas of observed change take its two poles, each with its own stripe and icon. Water-change
        candidates, if a validated classifier ever supports them, get separate colours and are never shown with the change layer, so a measured change is never
        mistaken for a classification.
      </p>
      <div className="c-keys">
        <ChangeKey />
        <FindingKey />
        <WaterKey />
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
