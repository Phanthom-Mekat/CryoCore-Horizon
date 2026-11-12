"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { download } from "@/lib/chattogram/brief";

type Measurement = { polarization: string; common_area_km2: number; common_valid_pixels: number; geographic_exclusion_km2: number; quality_excluded_pixels: number; median_change_db: number; p05_change_db: number; p95_change_db: number };
type Brief = {
  case_id: string; title: string; method: string; processed_utc: string; claim: string;
  change_definition: string; distribution_note: string; validation_status: string;
  measurements: Measurement[]; limitations: string[]; validity_rule: string; alignment: string; attribution: string;
  grid: { crs: string; bounds: number[]; transform: number[] };
  sources: { concept_id: string; revision_id: number; acquisition: string; granule_id: string }[];
  assets: { name: string; sha256: string }[];
  boundary: { source: string; year: number; license: string };
};
const fixed = (n: number, digits = 2) => n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function ProcessedBrief({ caseId }: { caseId: string }) {
  const [report, setReport] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/earth/cases/${caseId}/brief`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async r => { if (!r.ok) throw new Error(r.status === 404 ? "This processed case was not found." : "The observation brief is unavailable. Please try again."); return r.json() as Promise<Brief>; })
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [caseId, attempt]);
  if (error) return <div className="c-state" role="alert"><h1>Brief unavailable</h1><p>{error}</p><button className="c-btn" onClick={() => { setError(null); setAttempt(n => n + 1); }}>Try again</button><Link className="c-btn" href="/chattogram/processed">Return to radar</Link></div>;
  if (!report) return <div className="c-state" role="status">Preparing the measured observation brief…</div>;
  const extent = Math.max(1, ...report.measurements.flatMap(m => [Math.abs(m.p05_change_db), Math.abs(m.p95_change_db), Math.abs(m.median_change_db)]));
  const span = Math.ceil(extent);
  const x = (v: number) => 300 + v / span * 230;
  return <article className="c-evidence p-report" lang="en">
    <header className="c-ev-head">
      <p className="c-label">Measured observation brief · Experimental radar evidence</p>
      <h1>{report.title}</h1>
      <p className="c-bar-meta">{report.sources.map(s => s.acquisition.slice(0, 10)).join(" → ")} · Frequency A · {Math.abs(report.grid.transform[0])} m native pixels</p>
      <p className="c-ev-claim"><strong>What this establishes.</strong> {report.claim}</p>
      <div className="c-links c-noprint">
        <Link className="c-btn" href="/chattogram/processed"><ArrowLeft size={15} />Return to radar</Link>
        <button className="c-btn is-primary" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button>
        <button className="c-btn" onClick={() => download(`radar-brief-${caseId}.json`, JSON.stringify(report, null, 2), "application/json")}><Download size={15} />Evidence JSON</button>
        <a className="c-btn" href={`/api/earth/cases/${caseId}/brief?format=csv`}><Download size={15} />Measurements CSV</a>
      </div>
    </header>

    <section className="c-ev-card p-report-chart">
      <h2>The distribution of measured change</h2>
      <p>{report.change_definition}</p>
      <svg viewBox="0 0 600 210" role="img" aria-label="HH and HV radar-change distributions. Lines show the fifth to ninety-fifth percentiles; dots show medians. Exact values follow in the table.">
        <line x1="300" y1="20" x2="300" y2="160" stroke="currentColor" strokeDasharray="4 4" opacity="0.45" />
        {[-span, 0, span].map(v => <text key={v} x={x(v)} y="190" textAnchor="middle" fill="currentColor" fontSize="14">{v > 0 ? "+" : ""}{v} dB</text>)}
        {report.measurements.map((m, i) => <g key={m.polarization}>
          <text x="12" y={65 + i * 70} fill="currentColor" fontSize="18">{m.polarization}</text>
          <line x1={x(m.p05_change_db)} x2={x(m.p95_change_db)} y1={60 + i * 70} y2={60 + i * 70} stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity="0.3" />
          <circle cx={x(m.median_change_db)} cy={60 + i * 70} r="8" fill="currentColor" />
          <text x={x(m.median_change_db)} y={41 + i * 70} textAnchor="middle" fill="currentColor" fontSize="14">{fixed(m.median_change_db)} dB</text>
        </g>)}
      </svg>
      <p className="c-hint">{report.distribution_note}</p>
    </section>

    <section className="c-ev-card p-report-results">
      <h2>Measurements and coverage</h2>
      <div className="p-report-table" role="region" aria-label="Measurements table" tabIndex={0}><table>
        <caption>Change in dB; area in km². Display rounded; CSV and JSON retain published precision.</caption>
        <thead><tr><th scope="col">Pol.</th><th scope="col">Median</th><th scope="col">P05</th><th scope="col">P95</th><th scope="col">Common area</th><th scope="col">Valid pixels</th><th scope="col">Geographic exclusion</th><th scope="col">Quality exclusions (pixels)</th></tr></thead>
        <tbody>{report.measurements.map(m => <tr key={m.polarization}><th scope="row">{m.polarization}</th><td>{fixed(m.median_change_db)}</td><td>{fixed(m.p05_change_db)}</td><td>{fixed(m.p95_change_db)}</td><td>{fixed(m.common_area_km2, 4)}</td><td>{fixed(m.common_valid_pixels, 0)}</td><td>{fixed(m.geographic_exclusion_km2, 4)}</td><td>{fixed(m.quality_excluded_pixels, 0)}</td></tr>)}</tbody>
      </table></div>
      <p className="c-hint">Geographic exclusion is outside the clipped study area but inside the raster window. Quality exclusions are inside the study area. Neither is unchanged terrain.</p>
    </section>

    <section className="c-ev-card c-ev-limits"><h2>Interpretation and limitations</h2><p><strong>{report.validation_status}</strong></p><ul>{report.limitations.map(l => <li key={l}>{l}</li>)}</ul></section>
    <section className="c-ev-card p-report-method"><h2>How the result was produced</h2><p><strong>{report.method}</strong> · {report.grid.crs}</p><p>{report.validity_rule}</p><p>{report.alignment}</p><p className="c-hint">Boundary: {report.boundary.source}, {report.boundary.year}; {report.boundary.license}.</p></section>
    <section className="c-ev-sources"><h2>Source acquisitions</h2><div className="c-ev-pair">{report.sources.map((s, i) => <div className="c-ev-card" key={s.concept_id}><p className="c-label">{i === 0 ? "Before" : "After"} · {s.acquisition.slice(0, 10)}</p><a href={`https://cmr.earthdata.nasa.gov/search/concepts/${s.concept_id}.html`} target="_blank" rel="noreferrer">{s.concept_id} · revision {s.revision_id}</a><p className="c-ev-granule c-mono">{s.granule_id}</p></div>)}</div></section>
    <section className="c-ev-card p-report-audit"><h2>Reproducible evidence</h2><p>Case {report.case_id} · processed {report.processed_utc}. The JSON includes native-grid metadata, all source records and SHA-256 checksums for {report.assets.length} assets.</p><a href={`/api/earth/cases/${caseId}`} target="_blank" rel="noreferrer">Open complete case manifest</a></section>
    <p className="c-ev-foot">{report.attribution} · Report schema: processed-observation-brief/1</p>
  </article>;
}
