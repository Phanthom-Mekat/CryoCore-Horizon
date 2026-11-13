"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Download, FileText, History, Link2, Map as MapIcon, Printer, X } from "lucide-react";
import { api } from "@/lib/chattogram/api";
import { compatibility, type Acquisition } from "@/lib/chattogram/acquisitions";
import { pilotCovers } from "@/lib/chattogram/processed";
import { rainBefore } from "@/lib/chattogram/rain";
import { METHOD_VERSION, briefCsv, briefGeojson, briefJson, download } from "@/lib/chattogram/brief";
import { CASE_ID, type ProcessedCase } from "@/lib/chattogram/case-api";
import { selectFinding } from "@/lib/chattogram/finding-selection";
import { fmtArea, fmtDate, fmtDateTime, fmtNum, fmtSigned, fmtSize } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "../BackendText";
import { useCase, usePilot } from "../CaseProvider";
import { plainLayer, plainOf } from "@/lib/chattogram/plain";
import { FindingPanel, UnknownFinding } from "../FindingPanel";
import { MethodName } from "../MethodName";
import { FINDING } from "../MapKey";
import { PrepStatus } from "../PrepStatus";

// The page follows the interface language; the downloaded brief (JSON, CSV, GeoJSON) stays in English, since it is a data
// file for other tools and its field names must not change with the reader's language.
export function EvidenceView() {
  const { load, before, after, source, rain, href, processed, isCasePair, caseHref, finding, set } = useCase();
  const t = useT();
  const ev = t.evidence;
  const findings = usePilot();
  const [copied, setCopied] = useState<"view" | "replay" | null>(null);
  const replaying = source.mode === "frozen";

  if (load.status !== "ready" || !before || !after) return null;
  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const measured = pc && isCasePair ? pc : null; // the processed numbers describe exactly this pair
  const toCase = pc && !isCasePair ? caseHref("/chattogram/evidence") : null;
  const sel = selectFinding(pc, finding); // the finding picked on Explore (URL `f`)
  const clearFinding = () => {
    set({ f: null });
    document.getElementById("ev-title")?.focus(); // the button is gone; keep keyboard users on the page
  };
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
  const pilot = findings.status === "ready" ? findings.data : null;
  const pilotMeasured = pilot !== null && pilotCovers(pilot, before.conceptId, after.conceptId);
  const pilotDates = pilot ? ([fmtDate(pilot.sources[0].acquisition), fmtDate(pilot.sources[1].acquisition)] as const) : null;
  const replayable = Boolean(source.frozenAt && before.frozen && after.frozen);
  const copy = (text: string, which: "view" | "replay") => navigator.clipboard?.writeText(text).then(() => setCopied(which), () => setCopied(null));

  return (
    <article className="c-evidence">
      <header className="c-ev-head">
        <p className="c-label">
          {ev.briefLabel(
            measured ? (
              <MethodName key="method" method={measured.detail.method} />
            ) : (
              <span key="method" lang="en" translate="no">
                {METHOD_VERSION}
              </span>
            ),
          )}
        </p>
        <h1 id="ev-title" tabIndex={-1}>
          {t.place.region}: {t.vs(fmtDate(before.start), fmtDate(after.start))}
        </h1>
        <p className="c-ev-claim">
          <strong>{ev.whatShows}</strong> {measured ? (measured.detail.synthetic_fixture ? ev.claimSynthetic : ev.claimProcessed) : pilotMeasured ? ev.claimPilot : ev.claim}
        </p>
        <div className="c-links c-noprint">
          <button type="button" className="c-btn is-primary" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            {ev.print}
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.json`, JSON.stringify(briefJson(region, before, after, url, source, replayable ? replayUrl : null, rain, pc, pilot, finding), null, 2), "application/json")}>
            <Download size={15} aria-hidden="true" />
            JSON
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.csv`, briefCsv(before, after, pc, finding), "text/csv")}>
            <Download size={15} aria-hidden="true" />
            CSV
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.geojson`, JSON.stringify(briefGeojson(before, after, pc, finding)), "application/geo+json")}>
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

      {sel.kind === "unknown" && (
        <UnknownFinding id={sel.id} onClear={clearFinding} />
      )}
      {pc && sel.kind === "selected" && (
        // FindingPanel is the labelled region; this wrapper only adds the heading row
        <div className="c-ev-selected">
          <div className="c-ev-selected-head">
            <p className="c-label">{ev.selectedLabel}</p>
            <Link className="c-btn c-noprint" href={href("/chattogram/explore")}>
              <MapIcon size={15} aria-hidden="true" />
              {ev.showOnMap}
            </Link>
            {toCase && (
              <p className="c-hint">
                {ev.selectedOtherPair(`${fmtDate(pc.detail.before.date)} → ${fmtDate(pc.detail.after.date)}`)} <Link href={toCase}>{ev.caseOpenPair}</Link>
              </p>
            )}
          </div>
          <FindingPanel
            key={sel.finding.properties.id}
            finding={sel.finding}
            detail={pc.detail}
            timeseries={pc.timeseries}
            onClose={clearFinding}
            plain={(() => {
              const layer = plainLayer(pc);
              const id = plainOf(pc, sel.finding.properties.id);
              return layer && id ? { id, layer } : null;
            })()}
          />
        </div>
      )}

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
                <dd>
                  {ev.measuredCase(
                    fmtArea(measured.detail.metrics.valid_common_km2),
                    fmtArea(measured.detail.metrics.analysis_km2),
                    fmtArea(measured.detail.metrics.increase_km2),
                    fmtArea(measured.detail.metrics.decrease_km2),
                    fmtNum(measured.detail.metrics.threshold_db),
                  )}
                </dd>
              ) : pilotMeasured ? (
                <dd>{ev.measuredPilot(fmtSigned(pilot.statistics.HHHH.median_change_db), fmtSigned(pilot.statistics.HVHV.median_change_db), fmtNum(pilot.statistics.HHHH.common_area_km2, 2))}</dd>
              ) : (
                <dd className="is-missing">
                  {pc ? `${ev.measuredNotPair} ` : ""}
                  {pilotDates ? ev.measuredOther(...pilotDates) : ev.measuredBody}
                </dd>
              )}
            </div>
            <div>
              <dt>{ev.interpreted}</dt>
              <dd className="is-missing">
                {measured ? `${ev.interpretedCase} ` : ""}
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

        <div className="c-ev-card c-ev-pilot">
          <h2>{ev.findings}</h2>
          {replaying && !pilot ? (
            <p className="is-missing">{ev.findingsFrozen}</p>
          ) : findings.status === "loading" ? (
            <p>{ev.checking}</p>
          ) : pilot && pilotDates ? (
            <>
              <p>
                {ev.pilotFor(pilot.title, ...pilotDates)} {pilotMeasured ? ev.pilotSame : ev.pilotOther}
              </p>
              <dl className="c-ev-levels">
                <div>
                  <dt>{ev.pilotArea}</dt>
                  <dd>{fmtNum(pilot.statistics.HHHH.common_area_km2, 2)} km²</dd>
                </div>
                <div>
                  <dt>{ev.pilotOutside}</dt>
                  <dd>{fmtNum(pilot.statistics.HHHH.outside_roi_area_km2, 2)} km²</dd>
                </div>
                {(["HHHH", "HVHV"] as const).map((k) => {
                  const st = pilot.statistics[k];
                  return (
                    <div key={k}>
                      <dt>{ev.pilotMedian(k.slice(0, 2))}</dt>
                      <dd>
                        {fmtSigned(st.median_change_db)} dB <small>{ev.pilotRange(fmtSigned(st.change_percentiles_db[0]), fmtSigned(st.change_percentiles_db[2]))}</small>
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="is-missing">{ev.pilotNoFindings}</p>
              <details>
                <summary>{ev.pilotLimits}</summary>
                <ul lang="en">
                  {pilot.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
              <Link className="c-btn c-noprint" href={href("/chattogram/processed")}>
                {ev.pilotOpen} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <p className="is-missing">
              {findings.status === "unavailable" ? (
                ev.findingsMissing
              ) : findings.status === "failed" ? (
                // the technical detail is for whoever runs the servers, so it stays as the service reported it
                <span lang="en" translate="no">
                  {findings.reason}
                </span>
              ) : (
                ev.findingsNone
              )}
            </p>
          )}
        </div>
        {!pc && (
          <div className="c-ev-card">
            <PrepStatus />
          </div>
        )}
      </section>

      {pc && <Processed pc={pc} toCase={toCase} selected={sel.kind === "selected" ? sel.finding.properties.id : null} />}

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

/** The processed case as the backend published it: metrics, findings, method, caveats and sources. `selected` marks a finding's row. */
function Processed({ pc, toCase, selected }: { pc: ProcessedCase; toCase: string | null; selected: string | null }) {
  const { source, frozenCurated } = useCase();
  const t = useT();
  const ev = t.evidence;
  const d = pc.detail;
  const m = d.metrics;
  const span = `${fmtDate(d.before.date)} → ${fmtDate(d.after.date)}`;
  const km2 = (v: number) => `${fmtArea(v)} km²`;
  const db = (v: number, signed = false) => `${signed ? fmtSigned(v, 1) : fmtNum(v, 1)} dB`;
  const provenance = d.analysis_area.properties?.provenance;
  return (
    <section className="c-ev-sources">
      <h2>
        {ev.caseLabel} <BackendText text={d.title} translated={t.overview.caseTitles[d.id]} />
      </h2>
      <p className="c-hint">
        <BackendText text={d.place} translated={t.prep.places[d.place]} /> · {span} · {ev.casePublished(fmtDate(d.updated_at))} · <MethodName method={d.method} />
        {toCase && (
          <>
            {" "}
            · {ev.caseOtherPair} <Link href={toCase}>{ev.caseOpenPair}</Link>
          </>
        )}
      </p>
      <div className="c-ev-grid">
        <div className="c-ev-card">
          <h3>{ev.caseAreas(span)}</h3>
          {m ? (
            <dl className="c-ev-src">
              {(
                [
                  [ev.analysisRect, km2(m.analysis_km2)],
                  [ev.validBoth, km2(m.valid_common_km2)],
                  [ev.excluded, km2(m.excluded_km2)],
                  [ev.brighterBy(fmtNum(m.threshold_db)), km2(m.increase_km2)],
                  [ev.darkerBy(fmtNum(m.threshold_db)), km2(m.decrease_km2)],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="is-missing">{ev.noMetrics}</p>
          )}
          {provenance && (
            <p className="c-hint">
              <BackendText text={provenance} translated={t.overview.areaProvenance[provenance]} />
            </p>
          )}
        </div>
        <div className="c-ev-card">
          <h3>{ev.methodParams}</h3>
          <p className="c-hint">{ev.methodParamsNote}</p>
          {/* parameter names and values are the method's own identifiers */}
          <dl className="c-ev-src" lang="en" translate="no">
            {Object.entries(d.method?.params ?? {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="c-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="c-ev-card">
          <h3>{ev.caveats}</h3>
          <ul>
            {d.caveats.map((c) => (
              <li key={c}>
                <BackendText text={c} translated={ev.caveatTexts[c]} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="c-ev-card">
        <h3>{ev.caseFindings(fmtNum(pc.findings.features.length))}</h3>
        {pc.findings.features.length ? (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th>{ev.colArea}</th>
                  <th>{ev.colKind}</th>
                  <th>{ev.colSize}</th>
                  <th>{ev.colMean}</th>
                  <th>{ev.colMedian}</th>
                  <th>{ev.colValid}</th>
                  <th>{ev.colQuality}</th>
                </tr>
              </thead>
              <tbody>
                {pc.findings.features.map(({ properties: p }) => {
                  const isSelected = p.id === selected;
                  return (
                  <tr key={p.id} className={isSelected ? "is-selected" : undefined} aria-current={isSelected ? "true" : undefined}>
                    <td>
                      <span className="c-mono" lang="en" translate="no">
                        {p.id}
                      </span>
                      {isSelected && <small className="c-ev-sel-tag">{ev.selectedRow}</small>}
                    </td>
                    <td>
                      <span aria-hidden="true" style={{ color: FINDING[p.kind]?.color }}>
                        {FINDING[p.kind]?.icon}
                      </span>{" "}
                      <BackendText text={p.kind} translated={t.finding.kind[p.kind]} />
                    </td>
                    <td>{fmtArea(p.area_km2)}</td>
                    <td>{db(p.mean_delta_db, true)}</td>
                    <td>
                      {db(p.median_before_db)} → {db(p.median_after_db)}
                    </td>
                    <td>{fmtNum(Math.round(p.valid_fraction * 100))}%</td>
                    <td>
                      <BackendText text={p.quality} translated={t.finding.quality[p.quality]} />
                      {": "}
                      <BackendText text={p.quality_reason} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{ev.noCaseFindings}</p>
        )}
      </div>

      <div className="c-ev-card">
        <h3>{ev.processedFrom}</h3>
        <ul>
          {d.sources.map((s) => (
            <li key={s.granule}>
              <span lang="en" translate="no">
                <span className="c-mono">{s.granule}</span> · {s.collection}
                {s.version ? ` v${s.version}` : ""}
              </span>
              {s.md5 ? ` · MD5 ${s.md5}` : ""}
              {s.size_bytes ? ` · ${fmtSize(s.size_bytes)}` : ""}
              {s.qa_url && (
                <>
                  {" "}
                  ·{" "}
                  <a href={s.qa_url} target="_blank" rel="noreferrer">
                    {t.finding.qaReport}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="c-links c-noprint">
          <span className="c-hint">{ev.stored}</span>
          {(["json", "csv", "geojson"] as const).map((f) => (
            <a key={f} className="c-btn" href={frozenCurated && source.mode === "frozen" ? frozenCurated.exports[f] : api.exportUrl(CASE_ID, f)} download>
              <Download size={15} aria-hidden="true" />
              {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
