"use client";

import { useEffect, useState } from "react";
import { Check, Download, FileText, History, Link2, Printer, X } from "lucide-react";
import { api, toLoadError, type Load } from "@/lib/chattogram/api";
import { compatibility, fmtDate, fmtSize, fmtTime, type Acquisition } from "@/lib/chattogram/acquisitions";
import { CLAIM, METHOD_VERSION, briefCsv, briefGeojson, briefJson, download } from "@/lib/chattogram/brief";
import { useCase } from "../CaseProvider";

export function EvidenceView() {
  const { load, before, after, source } = useCase();
  const [findings, setFindings] = useState<Load<unknown[]>>({ status: "loading" });
  const [copied, setCopied] = useState<"view" | "replay" | null>(null);

  // processed findings come from the backend's planned /cases API; until it exists this says so plainly.
  // A frozen replay asks nothing live: the snapshot holds no processed findings yet.
  const replaying = source.mode === "frozen";
  useEffect(() => {
    if (replaying) return;
    api.cases().then(
      (c) => setFindings(c.length ? { status: "ready", data: c } : { status: "empty", reason: "The backend has no processed cases yet." }),
      (e) => setFindings(toLoadError(e)),
    );
  }, [replaying]);

  if (load.status !== "ready" || !before || !after) return null;
  const region = load.data.region;
  const checks = compatibility(before, after);
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
        <p className="c-label">Observation brief · {METHOD_VERSION}</p>
        <h1>
          {region.name}: {fmtDate(before.start)} vs {fmtDate(after.start)}
        </h1>
        <p className="c-ev-claim">
          <strong>What this shows.</strong> {CLAIM}
        </p>
        <div className="c-links c-noprint">
          <button type="button" className="c-btn is-primary" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            Print or save as PDF
          </button>
          <button type="button" className="c-btn" onClick={() => download(`${stem}.json`, JSON.stringify(briefJson(region, before, after, url, source, replayable ? replayUrl : null), null, 2), "application/json")}>
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
            {copied === "view" ? "Link copied" : "Copy link to this view"}
          </button>
          {replayable && (
            <button
              type="button"
              className="c-btn"
              onClick={() => copy(replayUrl, "replay")}
              title="Opens these two dates from the frozen case, with no live NASA or backend request"
            >
              <History size={15} aria-hidden="true" />
              {copied === "replay" ? "Replay link copied" : "Copy replay link"}
            </button>
          )}
        </div>
      </header>

      <section className="c-ev-grid">
        <div className="c-ev-card">
          <h2>Measured vs interpreted</h2>
          <dl className="c-ev-levels">
            <div>
              <dt>Observed</dt>
              <dd>Two NISAR acquisitions of the same ground from the same orbit geometry, {Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5)} days apart.</dd>
            </div>
            <div>
              <dt>Measured</dt>
              <dd className="is-missing">Nothing yet. Signed backscatter change (dB) needs the calibrated γ⁰ layers, quality masks and a common grid.</dd>
            </div>
            <div>
              <dt>Interpreted</dt>
              <dd className="is-missing">Nothing yet. Water change would need a versioned classifier and independent reference checks.</dd>
            </div>
          </dl>
        </div>

        <div className="c-ev-card">
          <h2>Can these two dates be compared?</h2>
          <ul className="c-ev-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "is-ok" : "is-diff"}>
                {c.ok ? <Check size={16} aria-label="Yes" /> : <X size={16} aria-label="No" />}
                <span>
                  {c.label}
                  <small>{c.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="c-ev-card">
          <h2>Processed findings</h2>
          {replaying ? (
            <p className="is-missing">None in the frozen case: it was captured before the processing worker produced findings.</p>
          ) : findings.status === "loading" ? (
            <p>Checking the backend…</p>
          ) : findings.status === "ready" ? (
            <p>{findings.data.length} processed case(s) available from the backend.</p>
          ) : (
            <p className="is-missing">
              {findings.status === "unavailable"
                ? "Not available yet: the backend doesn’t serve /api/v1/cases. Change polygons, their area and quality flags appear here once the processing worker publishes them."
                : findings.reason}
            </p>
          )}
        </div>
      </section>

      <section className="c-ev-sources">
        <h2>Sources</h2>
        <div className="c-ev-pair">
          <Source role="Before" a={before} />
          <Source role="After" a={after} />
        </div>
      </section>

      <section className="c-ev-card c-ev-limits">
        <h2>Limitations</h2>
        <ul>
          <li>Quicklooks are browse images: a colour composite of polarizations, stretched for display. Brightness is not calibrated backscatter.</li>
          <li>Tide, rain on the surface, wind on water, wet soil and crop growth all change radar brightness; a difference is not proof of flooding.</li>
          <li>
            The division outline is the {region.provenance.year} reference boundary from {region.provenance.source}, not verified as today’s legal boundary.
            No area figures are given until change is measured in an equal-area projection.
          </li>
          <li>Provisional products are early releases; NASA advises not mixing maturity levels in one analysis. Each date’s maturity is listed above.</li>
        </ul>
      </section>

      <p className="c-ev-foot">
        NISAR data: NASA and ISRO, distributed by the Alaska Satellite Facility DAAC. Discovered through NASA Earthdata CMR. Brief generated from the view at{" "}
        <span className="c-mono">{url}</span>
      </p>
    </article>
  );
}

function Source({ role, a }: { role: string; a: Acquisition }) {
  const rows: [string, string][] = [
    ["Acquired", `${fmtDate(a.start)}, ${fmtTime(a.start)}`],
    ["Geometry", `Track ${a.track}, frame ${a.frame}, ${a.direction.toLowerCase()}, orbit ${a.orbit ?? "–"}`],
    ["Polarizations", a.polarizations.join(" + ") || "–"],
    ["Collection", a.collection],
    ["Maturity", a.maturity ?? "Not labelled beta/provisional"],
    ["Product", `GCOV v${a.version ?? "?"}${a.produced ? `, produced ${fmtDate(a.produced)}` : ""}`],
    ["HDF5", `${fmtSize(a.sizeBytes)}${a.md5 ? `, MD5 ${a.md5}` : ""}`],
    ["CMR concept", a.conceptId],
    [
      "Quicklook",
      a.frozen
        ? `Frozen case file, SHA-256 ${a.frozen.sha256.slice(0, 16)}…, corners from ${a.frozen.cornersFrom === "kml" ? "ASF’s KML" : "the CMR footprint"}`
        : "Loaded live from ASF through our proxy",
    ],
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
          NASA QA report
        </a>
      )}
    </div>
  );
}
