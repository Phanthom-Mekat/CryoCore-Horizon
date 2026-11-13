"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { download } from "@/lib/chattogram/brief";
import { fmtDate, fmtDateTime, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "./BackendText";
import type { RadarState } from "@/lib/chattogram/processed-state";

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
type AreaRow = { polarization: string; valid_area_km2: number; excluded_area_km2: number; before_median_db: number | null; after_median_db: number | null; change_median_db: number | null };
type AreaEvidence = { status: string; selected_area_km2: number; selected_pixels: number; clipped_to_extent: boolean; measurements: AreaRow[]; geometry?: GeoJSON.Polygon };
/** Identifiers, proper names and technical values that stay as published, in every language. */
const Published = ({ children }: { children: ReactNode }) => <span lang="en" translate="no">{children}</span>;

export function ProcessedBrief({ caseId, area }: { caseId: string; area: RadarState["area"] }) {
  const t = useT();
  const r = t.report;
  const texts = t.processed.texts;
  /** One of the pilot's fixed backend sentences, in Bangla when messages.ts has it. */
  const pilotText = (text: string) => <BackendText text={text} translated={texts[text]} />;
  const [report, setReport] = useState<Brief | null>(null);
  const [error, setError] = useState<keyof typeof r.errors | null>(null);
  const [attempt, setAttempt] = useState(0);
  // the area chosen on the Calibrated radar page, measured again from the same native rasters
  const [areaData, setAreaData] = useState<AreaEvidence | "failed" | null>(null);
  useEffect(() => {
    if (!area) return;
    const controller = new AbortController();
    const q = new URLSearchParams({ lon1: String(area[0][0]), lat1: String(area[0][1]), lon2: String(area[1][0]), lat2: String(area[1][1]) });
    fetch(`/api/earth/cases/${caseId}/area?${q}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async res => { if (!res.ok) throw new Error(String(res.status)); return res.json() as Promise<AreaEvidence>; })
      .then(d => { if (!controller.signal.aborted) setAreaData(d); })
      .catch(() => { if (!controller.signal.aborted) setAreaData("failed"); });
    return () => controller.abort();
  }, [caseId, area]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/earth/cases/${caseId}/brief`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async res => { if (!res.ok) { if (!controller.signal.aborted) setError(res.status === 404 ? "notFound" : "failed"); return null; } return res.json() as Promise<Brief>; })
      .then(data => { if (data && !controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setError("failed"); });
    return () => controller.abort();
  }, [caseId, attempt]);
  if (error) return <div className="c-state" role="alert"><h1>{r.unavailable}</h1><p>{r.errors[error]}</p><button className="c-btn" onClick={() => { setError(null); setAttempt(n => n + 1); }}>{t.gate.tryAgain}</button><Link className="c-btn" href="/chattogram/processed">{r.back}</Link></div>;
  if (!report) return <div className="c-state" role="status">{r.preparing}</div>;
  const extent = Math.max(1, ...report.measurements.flatMap(m => [Math.abs(m.p05_change_db), Math.abs(m.p95_change_db), Math.abs(m.median_change_db)]));
  const span = Math.ceil(extent);
  const x = (v: number) => 300 + v / span * 230;
  return <article className="c-evidence p-report">
    <header className="c-ev-head">
      <p className="c-label">{r.label}</p>
      <h1>{pilotText(report.title)}</h1>
      <p className="c-bar-meta">{r.meta(report.sources.map(s => fmtDate(s.acquisition)).join(" → "), fmtNum(Math.abs(report.grid.transform[0])))}</p>
      <p className="c-ev-claim"><strong>{r.establishes}</strong> {pilotText(report.claim)}</p>
      <div className="c-links c-noprint">
        <Link className="c-btn" href="/chattogram/processed"><ArrowLeft size={15} />{r.back}</Link>
        <button className="c-btn is-primary" onClick={() => window.print()}><Printer size={15} />{r.print}</button>
        <button className="c-btn" onClick={() => download(`radar-brief-${caseId}.json`, JSON.stringify(area ? { ...report, selected_area: areaData === "failed" ? null : { corners_wgs84: area, ...areaData } } : report, null, 2), "application/json")}><Download size={15} />{r.json}</button>
        <a className="c-btn" href={`/api/earth/cases/${caseId}/brief?format=csv`}><Download size={15} />{r.csv}</a>
      </div>
    </header>

    <section className="c-ev-card p-report-chart">
      <h2>{r.chartTitle}</h2>
      <p>{pilotText(report.change_definition)}</p>
      <svg viewBox="0 0 600 210" role="img" aria-label={r.chartLabel}>
        <line x1="300" y1="20" x2="300" y2="160" stroke="currentColor" strokeDasharray="4 4" opacity="0.45" />
        {[-span, 0, span].map(v => <text key={v} x={x(v)} y="190" textAnchor="middle" fill="currentColor" fontSize="14">{fmtSigned(v, 0)} dB</text>)}
        {report.measurements.map((m, i) => <g key={m.polarization}>
          <text x="12" y={65 + i * 70} fill="currentColor" fontSize="18">{m.polarization}</text>
          <line x1={x(m.p05_change_db)} x2={x(m.p95_change_db)} y1={60 + i * 70} y2={60 + i * 70} stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity="0.3" />
          <circle cx={x(m.median_change_db)} cy={60 + i * 70} r="8" fill="currentColor" />
          <text x={x(m.median_change_db)} y={41 + i * 70} textAnchor="middle" fill="currentColor" fontSize="14">{fmtNum(m.median_change_db, 2)} dB</text>
        </g>)}
      </svg>
      <p className="c-hint">{pilotText(report.distribution_note)}</p>
    </section>

    <section className="c-ev-card p-report-results">
      <h2>{r.results}</h2>
      <div className="p-report-table" role="region" aria-label={r.table} tabIndex={0}><table>
        <caption>{r.caption}</caption>
        <thead><tr><th scope="col">{r.cols.pol}</th><th scope="col">{r.cols.median}</th><th scope="col">{r.cols.p05}</th><th scope="col">{r.cols.p95}</th><th scope="col">{r.cols.area}</th><th scope="col">{r.cols.valid}</th><th scope="col">{r.cols.geographic}</th><th scope="col">{r.cols.quality}</th></tr></thead>
        <tbody>{report.measurements.map(m => <tr key={m.polarization}><th scope="row">{m.polarization}</th><td>{fmtNum(m.median_change_db, 2)}</td><td>{fmtNum(m.p05_change_db, 2)}</td><td>{fmtNum(m.p95_change_db, 2)}</td><td>{fmtNum(m.common_area_km2, 4)}</td><td>{fmtNum(m.common_valid_pixels)}</td><td>{fmtNum(m.geographic_exclusion_km2, 4)}</td><td>{fmtNum(m.quality_excluded_pixels)}</td></tr>)}</tbody>
      </table></div>
      <p className="c-hint">{r.tableHint}</p>
    </section>

    {area && <section className="c-ev-card p-report-area">
      <h2>{r.area.title}</h2>
      <p className="c-hint">{r.area.intro}</p>
      {areaData === null ? <p role="status">{t.area.reading}</p> : areaData === "failed" ? <p role="alert">{t.area.error}</p> : areaData.status === "outside_extent" ? <p>{t.area.outside}</p> : <>
        <p>{t.area.selected(<strong key="area">{fmtNum(areaData.selected_area_km2, 4)} km²</strong>, fmtNum(areaData.selected_pixels))}</p>
        {areaData.clipped_to_extent && <p className="c-hint">{t.area.clipped}</p>}
        <div className="p-report-table" role="region" aria-label={r.area.title} tabIndex={0}><table>
          <thead><tr><th scope="col">{r.cols.pol}</th><th scope="col">{t.area.validArea} (km²)</th><th scope="col">{t.area.excludedArea} (km²)</th><th scope="col">{t.area.beforeMedian} (dB)</th><th scope="col">{t.area.afterMedian} (dB)</th><th scope="col">{t.area.medianChange} (dB)</th></tr></thead>
          <tbody>{areaData.measurements.map(m => <tr key={m.polarization}><th scope="row">{m.polarization}</th><td>{fmtNum(m.valid_area_km2, 4)}</td><td>{fmtNum(m.excluded_area_km2, 4)}</td><td>{m.before_median_db === null ? "—" : fmtNum(m.before_median_db, 2)}</td><td>{m.after_median_db === null ? "—" : fmtNum(m.after_median_db, 2)}</td><td>{m.change_median_db === null ? "—" : fmtSigned(m.change_median_db, 2)}</td></tr>)}</tbody>
        </table></div>
      </>}
      <p className="c-hint">{t.area.caution}</p>
    </section>}

    <section className="c-ev-card c-ev-limits"><h2>{r.limits}</h2><p><strong>{pilotText(report.validation_status)}</strong></p><ul>{report.limitations.map(l => <li key={l}>{pilotText(l)}</li>)}</ul></section>
    <section className="c-ev-card p-report-method"><h2>{r.how}</h2><p><strong><Published>{report.method}</Published></strong> · <Published>{report.grid.crs}</Published></p><p>{pilotText(report.validity_rule)}</p><p>{pilotText(report.alignment)}</p><p className="c-hint">{r.boundary(<Published key="source">{report.boundary.source}</Published>, fmtNum(report.boundary.year), <Published key="license">{report.boundary.license}</Published>)}</p></section>
    <section className="c-ev-sources"><h2>{r.sources}</h2><div className="c-ev-pair">{report.sources.map((s, i) => <div className="c-ev-card" key={s.concept_id}><p className="c-label">{i === 0 ? t.before : t.after} · {fmtDate(s.acquisition)}</p><a href={`https://cmr.earthdata.nasa.gov/search/concepts/${s.concept_id}.html`} target="_blank" rel="noreferrer">{r.revision(<Published key="id">{s.concept_id}</Published>, fmtNum(s.revision_id))}</a><p className="c-ev-granule c-mono" lang="en" translate="no">{s.granule_id}</p></div>)}</div></section>
    <section className="c-ev-card p-report-audit"><h2>{r.audit}</h2><p>{r.auditBody(<Published key="case">{report.case_id}</Published>, fmtDateTime(report.processed_utc), fmtNum(report.assets.length))}</p><a href={`/api/earth/cases/${caseId}`} target="_blank" rel="noreferrer">{r.manifest}</a></section>
    <p className="c-ev-foot"><Published>{report.attribution}</Published> · {r.schema(<span key="schema" lang="en" translate="no">processed-observation-brief/1</span>)}</p>
  </article>;
}
