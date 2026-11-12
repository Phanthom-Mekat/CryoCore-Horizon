"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { fmtNum } from "@/lib/i18n/format";
import { useLang, useT } from "@/lib/i18n/useT";
import { useCase } from "../CaseProvider";
import { ChangeKey, FindingKey, WaterKey } from "../MapKey";
import { PrepStatus } from "../PrepStatus";

export function AboutView() {
  const { load, explorer, processed } = useCase();
  const ready = processed.status === "ready" && processed.data.detail.status === "ready";
  const t = useT();
  const lang = useLang();
  const ab = t.about;
  const region = explorer?.region;
  const n = load.status === "ready" ? load.data.acquisitions.length : 0;

  return (
    <article className="c-doc">
      <p className="c-eyebrow">{ab.eyebrow}</p>
      <h1>{ab.title}</h1>
      <p className="c-lede">{ab.lede}</p>

      <h2>{ab.realHere}</h2>
      <ul>
        <li>
          <strong>{ab.acqLead}</strong> {ab.acqBody(fmtNum(n))}
        </li>
        <li>
          <strong>{ab.radarLead}</strong> {ab.radarBody}
        </li>
        {region && (
          <li>
            <strong>{ab.boundaryLead}</strong>{" "}
            {/* the provenance note comes from the backend in English; the Bangla text is its translation */}
            {ab.boundaryBody(fmtNum(region.provenance.year), region.provenance.source, lang === "en" ? region.provenance.note : "")}
          </li>
        )}
      </ul>

      <h2 lang="en">Data preparation</h2>
      <div className="c-ev-card" lang="en">
        <PrepStatus />
      </div>

      <h2>{ab.notDone}</h2>
      <ul>
        {!ready && <li>{ab.notDone1}</li>}
        <li>{ab.notDone2}</li>
        <li>{ab.notDone3}</li>
      </ul>

      <h2>{ab.results}</h2>
      <p>{ab.resultsBody}</p>
      <div className="c-keys">
        <ChangeKey />
        <FindingKey />
        <WaterKey />
      </div>

      <h2>{ab.sources}</h2>
      <ul>
        <li>
          {ab.srcNisar}{" "}
          <a href="https://nisar-docs.asf.alaska.edu/gcov/" target="_blank" rel="noreferrer">
            Alaska Satellite Facility DAAC <ExternalLink size={12} aria-hidden="true" />
          </a>
          {ab.srcNisarVia}{" "}
          <a href="https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html" target="_blank" rel="noreferrer">
            NASA CMR <ExternalLink size={12} aria-hidden="true" />
          </a>
          {lang === "en" ? "." : "।"}
        </li>
        {region && (
          <li>
            {ab.srcBoundary}{" "}
            <a href={region.provenance.source_url} target="_blank" rel="noreferrer">
              {region.provenance.source} <ExternalLink size={12} aria-hidden="true" />
            </a>
            {ab.srcLicence}{" "}
            <a href={region.provenance.license_url} target="_blank" rel="noreferrer">
              {region.provenance.license} <ExternalLink size={12} aria-hidden="true" />
            </a>
            {lang === "en" ? "." : "।"} SHA-256 <span className="c-mono c-hash">{region.provenance.sha256}</span>
          </li>
        )}
        <li>
          {ab.srcBasemaps} <a href="https://www.mapbox.com/about/maps/">Mapbox</a>, © <a href="https://www.openstreetmap.org/copyright">{ab.srcOsm}</a>
          {lang === "en" ? "." : "।"}{" "}
          {ab.srcBasemapsNote}
        </li>
      </ul>

      <p className="c-aside">
        {ab.glacierAside} <Link href="/dashboard">{ab.glacierLink}</Link>
        {lang === "en" ? "." : "।"}
      </p>
    </article>
  );
}
