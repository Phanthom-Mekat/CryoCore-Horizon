"use client";

import { useEffect, useState } from "react";
import { Check, Download, FileText, History, Link2, Printer, X } from "lucide-react";
import { api, toLoadError, type Load } from "@/lib/chattogram/api";
import { compatibility, type Acquisition } from "@/lib/chattogram/acquisitions";
import { rainBefore } from "@/lib/chattogram/rain";
import { METHOD_VERSION, briefCsv, briefGeojson, briefJson, download } from "@/lib/chattogram/brief";
import { fmtDate, fmtDateTime, fmtNum, fmtSize } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { useCase } from "../CaseProvider";

// The page follows the interface language; the downloaded brief (JSON, CSV, GeoJSON) stays in English, since it is a data
// file for other tools and its field names must not change with the reader's language.
export function EvidenceView() {
  const { load, before, after, source, rain } = useCase();
  const t = useT();
  const ev = t.evidence;
  const [findings, setFindings] = useState<Load<unknown[]>>({ status: "loading" });
  const [copied, setCopied] = useState<"view" | "replay" | null>(null);

  // processed findings come from the backend's planned /cases API; until it exists this says so plainly.
  // A frozen replay asks nothing live: the snapshot holds no processed findings yet.
  const replaying = source.mode === "frozen";
  useEffect(() => {
    if (replaying) return;
    api.cases().then(
      (c) => setFindings(c.length ? { status: "ready", data: c } : { status: "empty", reason: "" }),
      (e) => setFindings(toLoadError(e)),
    );
  }, [replaying]);

  if (load.status !== "ready" || !before || !after) return null;
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
        <p className="c-label">{ev.briefLabel(METHOD_VERSION)}</p>
        <h1>
          {t.place.region}: {t.vs(fmtDate(before.start), fmtDate(after.start))}
        </h1>
        <p className="c-ev-claim">
          <strong>{ev.whatShows}</strong> {ev.claim}
        </p>
        <div className="c-links c-noprint">
          <button type="button" className="c-btn is-primary" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            {ev.print}
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.json`, JSON.stringify(briefJson(region, before, after, url, source, replayable ? replayUrl : null, rain), null, 2), "application/json")}>
            <Download size={15} aria-hidden="true" />
            JSON
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.csv`, briefCsv(before, after), "text/csv")}>
            <Download size={15} aria-hidden="true" />
            CSV
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.geojson`, JSON.stringify(briefGeojson(before, after)), "application/geo+json")}>
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
              <dd className="is-missing">{ev.measuredBody}</dd>
            </div>
            <div>
              <dt>{ev.interpreted}</dt>
              <dd className="is-missing">{ev.interpretedBody}</dd>
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

        <div className="c-ev-card">
          <h2>{ev.findings}</h2>
          {replaying ? (
            <p className="is-missing">{ev.findingsFrozen}</p>
          ) : findings.status === "loading" ? (
            <p>{ev.checking}</p>
          ) : findings.status === "ready" ? (
            <p>{ev.findingsReady(fmtNum(findings.data.length))}</p>
          ) : (
            <p className="is-missing">{findings.status === "unavailable" ? ev.findingsMissing : findings.status === "empty" ? ev.findingsNone : findings.reason}</p>
          )}
        </div>
      </section>

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
