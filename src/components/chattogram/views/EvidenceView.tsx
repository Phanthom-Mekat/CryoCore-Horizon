"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, FileText, History, Link2, Printer, X } from "lucide-react";
import { api } from "@/lib/chattogram/api";
import { compatibility, type Acquisition } from "@/lib/chattogram/acquisitions";
import { rainBefore } from "@/lib/chattogram/rain";
import { METHOD_VERSION, PROCESSED_CLAIM, SYNTHETIC_CLAIM, briefCsv, briefGeojson, briefJson, download } from "@/lib/chattogram/brief";
import { CASE_ID, fmtDb, fmtKm2, methodId, type ProcessedCase } from "@/lib/chattogram/case-api";
import { fmtDate, fmtDateTime, fmtNum, fmtSize } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { useCase } from "../CaseProvider";
import { FINDING } from "../MapKey";
import { PrepStatus } from "../PrepStatus";

// The page follows the interface language; the downloaded brief (JSON, CSV, GeoJSON) stays in English, since it is a data
// file for other tools and its field names must not change with the reader's language.
export function EvidenceView() {
  const { load, before, after, source, rain, processed, isCasePair, caseHref } = useCase();
  const t = useT();
  const ev = t.evidence;
  const [copied, setCopied] = useState<"view" | "replay" | null>(null);

  if (load.status !== "ready" || !before || !after) return null;
  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const measured = pc && isCasePair ? pc : null; // the processed numbers describe exactly this pair
  const toCase = pc && !isCasePair ? caseHref("/chattogram/evidence") : null;
  const region = load.data.region;
  const checks = compatibility(before, after);
  const days = Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5);
  const stem = `chattogram-${before.day}_vs_${after.day}`;
  const url = typeof window === "undefined" ? "" : window.location.href;
  // the same view, forced onto the frozen case: opens these dates and this extent with no live request (plan F09)
  const replayUrl = (() => {
    if (!url) return "";
    const u = new URL(url);
    u.searchParams.set("source", "frozen");
    return u.toString();
  })();
  const replayable = Boolean(source.frozenAt && before.frozen && after.frozen);
  const copy = (text: string, which: "view" | "replay") => navigator.clipboard?.writeText(text).then(() => setCopied(which), () => setCopied(null));

  return (
    <article className="c-evidence">
      <header className="c-ev-head">
        <p className="c-label">{ev.briefLabel(measured ? methodId(measured.detail) : METHOD_VERSION)}</p>
        <h1>
          {t.place.region}: {t.vs(fmtDate(before.start), fmtDate(after.start))}
        </h1>
        <p className="c-ev-claim">
          <strong>{ev.whatShows}</strong> {measured ? (measured.detail.synthetic_fixture ? SYNTHETIC_CLAIM : PROCESSED_CLAIM) : ev.claim}
        </p>
        <div className="c-links c-noprint">
          <button type="button" className="c-btn is-primary" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            {ev.print}
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.json`, JSON.stringify(briefJson(region, before, after, url, source, replayable ? replayUrl : null, rain, pc), null, 2), "application/json")}>
            <Download size={15} aria-hidden="true" />
            JSON
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.csv`, briefCsv(before, after, pc), "text/csv")}>
            <Download size={15} aria-hidden="true" />
            CSV
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.geojson`, JSON.stringify(briefGeojson(before, after, pc)), "application/geo+json")}>
            <Download size={15} aria-hidden="true" />
            GeoJSON
          </button>
          <button type="button" className="c-btn" onClick={() => copy(url, "view")}>
            <Link2 size={15} aria-hidden="true" />
            {copied === "view" ? ev.copied : ev.copyView}
          </button>
          {replayable && (
            <button type="button" className="c-btn" onClick={() => copy(replayUrl, "replay")} title={ev.replayTitle}>
              <History size={15} aria-hidden="true" />
              {copied === "replay" ? ev.replayCopied : ev.copyReplay}
            </button>
          )}
        </div>
      </header>

      <section className="c-ev-grid">
        <div className="c-ev-card">
          <h2>{ev.levels}</h2>
          <dl className="c-ev-levels">
            <div>
              <dt>{ev.observed}</dt>
              <dd>{ev.observedBody(fmtNum(days))}</dd>
            </div>
            <div>
              <dt>{ev.measured}</dt>
              {measured?.detail.metrics ? (
                <dd lang="en">
                  Signed change in calibrated backscatter (γ⁰, dB) over {fmtKm2(measured.detail.metrics.valid_common_km2)} valid in both dates, of the{" "}
                  {fmtKm2(measured.detail.metrics.analysis_km2)} analysis rectangle: {fmtKm2(measured.detail.metrics.increase_km2)} brighter and{" "}
                  {fmtKm2(measured.detail.metrics.decrease_km2)} darker by at least {measured.detail.metrics.threshold_db} dB.
                </dd>
              ) : (
                <dd className="is-missing">
                  {pc ? "Not for this pair: the processed case uses another pair (see below). " : ""}
                  {ev.measuredBody}
                </dd>
              )}
            </div>
            <div>
              <dt>{ev.interpreted}</dt>
              <dd className="is-missing">
                {measured ? "Each area is observed radar change, not water change, flooding or damage. " : ""}
                {ev.interpretedBody}
              </dd>
            </div>
          </dl>
        </div>

        <div className="c-ev-card">
          <h2>{ev.canCompare}</h2>
          <ul className="c-ev-checks">
            {checks.map((c) => (
              <li key={c.key} className={c.ok ? "is-ok" : "is-diff"}>
                {c.ok ? <Check size={16} aria-label={ev.yes} /> : <X size={16} aria-label={ev.no} />}
                <span>
                  {t.checks[c.key].label}
                  <small>{c.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!pc && (
          <div className="c-ev-card">
            <PrepStatus />
          </div>
        )}
      </section>

      {pc && <Processed pc={pc} toCase={toCase} />}

      <section className="c-ev-sources">
        <h2>{ev.sources}</h2>
        <div className="c-ev-pair">
          <Source role={t.before} a={before} />
          <Source role={t.after} a={after} />
        </div>
      </section>

      <section className="c-ev-card c-ev-limits">
        <h2>{ev.limits}</h2>
        <ul>
          <li>{ev.limit1}</li>
          <li>{ev.limit2}</li>
          <li>{ev.limit3(fmtNum(region.provenance.year), region.provenance.source)}</li>
          <li>{ev.limit4}</li>
        </ul>
      </section>

      <p className="c-ev-foot">
        {ev.foot} <span className="c-mono">{url}</span>
      </p>
    </article>
  );
}

function Source({ role, a }: { role: string; a: Acquisition }) {
  const t = useT();
  const { rain } = useCase();
  const week = rain && rainBefore(rain, a.day, 7);
  const ev = t.evidence;
  const num = (v: number | null) => (v === null ? "–" : fmtNum(v));
  const rows: [string, string][] = [
    [ev.acquired, fmtDateTime(a.start)],
    [ev.geometry, ev.geometryValue(num(a.track), num(a.frame), t.direction[a.direction], num(a.orbit))],
    [t.explore.polarizations, a.polarizations.join(" + ") || "–"],
    [ev.collection, a.collection],
    [t.explore.maturity, t.maturity[a.maturity ?? "none"]],
    [t.explore.product, `GCOV v${a.version ?? "?"}${a.produced ? `, ${ev.produced(fmtDate(a.produced))}` : ""}`],
    ["HDF5", `${fmtSize(a.sizeBytes)}${a.md5 ? `, MD5 ${a.md5}` : ""}`],
    [ev.cmr, a.conceptId],
    ...(week?.days ? [[t.rain.weekRow, t.rain.weekRowValue(fmtNum(week.mm, 0))] as [string, string]] : []),
    [ev.quicklook, a.frozen ? ev.quickFrozen(a.frozen.sha256.slice(0, 16), a.frozen.cornersFrom === "kml" ? ev.fromKml : ev.fromFootprint) : ev.quickLive],
  ];
  return (
    <div className="c-ev-card">
      <p className="c-label">{role}</p>
      <h3>{fmtDate(a.start)}</h3>
      <dl className="c-ev-src">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="c-ev-granule c-mono">{a.granule}</p>
      {a.qaReport && (
        <a className="c-btn c-noprint" href={a.qaReport} target="_blank" rel="noreferrer">
          <FileText size={15} aria-hidden="true" />
          {t.explore.qa}
        </a>
      )}
    </div>
  );
}

/** The processed case as the backend published it: metrics, findings, method, caveats and sources. */
function Processed({ pc, toCase }: { pc: ProcessedCase; toCase: string | null }) {
  const d = pc.detail;
  const m = d.metrics;
  const span = `${fmtDate(d.before.date)} → ${fmtDate(d.after.date)}`;
  return (
    <section className="c-ev-sources">
      <h2>Processed case: {d.title}</h2>
      <p className="c-hint">
        {d.place} · {span} · published {fmtDate(d.updated_at)} · {methodId(d)}
        {toCase && (
          <>
            {" "}
            · These numbers are for that pair, not the one above. <Link href={toCase}>Open the brief for the case pair</Link>
          </>
        )}
      </p>
      <div className="c-ev-grid">
        <div className="c-ev-card">
          <h3>Areas, {span}</h3>
          {m ? (
            <dl className="c-ev-src">
              {(
                [
                  ["Analysis rectangle", fmtKm2(m.analysis_km2)],
                  ["Valid in both dates", fmtKm2(m.valid_common_km2)],
                  ["Excluded (no data or masked)", fmtKm2(m.excluded_km2)],
                  [`Brighter by ≥ ${m.threshold_db} dB`, fmtKm2(m.increase_km2)],
                  [`Darker by ≥ ${m.threshold_db} dB`, fmtKm2(m.decrease_km2)],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="is-missing">The backend published no metrics for this case.</p>
          )}
          <p className="c-hint">{d.analysis_area.properties?.provenance}</p>
        </div>
        <div className="c-ev-card">
          <h3>Method parameters</h3>
          <dl className="c-ev-src">
            {Object.entries(d.method?.params ?? {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="c-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="c-ev-card">
          <h3>Caveats</h3>
          <ul>
            {d.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="c-ev-card">
        <h3>Areas of observed radar change ({pc.findings.features.length})</h3>
        {pc.findings.features.length ? (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Kind</th>
                  <th>Size, km²</th>
                  <th>Mean change, dB</th>
                  <th>Median γ⁰ before → after, dB</th>
                  <th>Valid</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                {pc.findings.features.map(({ properties: p }) => (
                  <tr key={p.id}>
                    <td className="c-mono">{p.id}</td>
                    <td>
                      <span aria-hidden="true" style={{ color: FINDING[p.kind].color }}>
                        {FINDING[p.kind].icon}
                      </span>{" "}
                      {FINDING[p.kind].label}
                    </td>
                    <td>{p.area_km2.toFixed(2)}</td>
                    <td>{fmtDb(p.mean_delta_db, true)}</td>
                    <td>
                      {fmtDb(p.median_before_db)} → {fmtDb(p.median_after_db)}
                    </td>
                    <td>{Math.round(p.valid_fraction * 100)}%</td>
                    <td>
                      {p.quality}: {p.quality_reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No area passed the method’s change threshold.</p>
        )}
      </div>

      <div className="c-ev-card">
        <h3>Processed from</h3>
        <ul>
          {d.sources.map((s) => (
            <li key={s.granule}>
              <span className="c-mono">{s.granule}</span> · {s.collection}
              {s.version ? ` v${s.version}` : ""}
              {s.md5 ? ` · MD5 ${s.md5}` : ""}
              {s.size_bytes ? ` · ${fmtSize(s.size_bytes)}` : ""}
              {s.qa_url && (
                <>
                  {" "}
                  ·{" "}
                  <a href={s.qa_url} target="_blank" rel="noreferrer">
                    QA report
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="c-links c-noprint">
          <span className="c-hint">The case as the backend stores it:</span>
          {(["json", "csv", "geojson"] as const).map((f) => (
            <a key={f} className="c-btn" href={api.exportUrl(CASE_ID, f)} download>
              <Download size={15} aria-hidden="true" />
              {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
