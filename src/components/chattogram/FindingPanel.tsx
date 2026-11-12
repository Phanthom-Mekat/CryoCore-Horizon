"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { api, toLoadError, type Load } from "@/lib/chattogram/api";
import { fmtDate } from "@/lib/i18n/format";
import { CASE_ID, fmtDb, fmtKm2, type CaseDetail, type Finding, type FindingDetail } from "@/lib/chattogram/case-api";
import { FINDING } from "./MapKey";

const QUALITY = { strong: "Strong", moderate: "Moderate", weak: "Weak" } as const;

/** A reference check (backend validation_records row): label, source, observation date and notes; else the raw record. */
const checkText = (c: unknown) => {
  const r = c as { label?: string; reference_source?: string; observed_at?: string; notes?: string };
  const parts = r && typeof r === "object" ? [r.label, r.reference_source, r.observed_at && fmtDate(r.observed_at), r.notes].filter(Boolean) : [];
  return parts.length ? parts.join(" · ") : JSON.stringify(c);
};

/** Click-to-explain (F07): what changed, why we think so, what is uncertain, and where every number comes from. */
export function FindingPanel({ finding, detail, onClose }: { finding: Finding; detail: CaseDetail; onClose: () => void }) {
  const p = finding.properties;
  const [ev, setEv] = useState<Load<FindingDetail>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    api.finding(CASE_ID, p.id).then(
      (d) => live && setEv({ status: "ready", data: d }),
      (e) => live && setEv(toLoadError(e)),
    );
    return () => {
      live = false;
    };
  }, [p.id]);

  const k = FINDING[p.kind];
  const [b, a] = [fmtDate(detail.before.date), fmtDate(detail.after.date)];
  const evidence = ev.status === "ready" ? ev.data.evidence : null;
  const sources = evidence?.sources ?? detail.sources;
  const checks = evidence?.reference_checks ?? [];
  const threshold = detail.metrics?.threshold_db;

  return (
    <section className="c-panel-block c-finding" aria-labelledby="finding-h">
      <div className="c-finding-head">
        <p className="c-label">
          <span aria-hidden="true" style={{ color: k.color }}>
            {k.icon}
          </span>{" "}
          {p.label} · {p.id}
        </p>
        <button type="button" className="c-btn c-finding-close" onClick={onClose} aria-label="Close this finding">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <h2 id="finding-h" className="c-acq-date">
        {p.kind === "increase" ? "Brighter radar return" : "Darker radar return"}, {fmtKm2(p.area_km2)}
      </h2>
      <p className={`c-quality is-${p.quality}`}>
        <strong>{QUALITY[p.quality]} evidence</strong> {p.quality_reason}
      </p>

      <h3>What changed</h3>
      <p>
        Between {b} and {a}, calibrated backscatter (γ⁰) over this {fmtKm2(p.area_km2)} area changed by a mean of <strong>{fmtDb(p.mean_delta_db, true)}</strong>.
      </p>
      <dl className="c-facts">
        <div>
          <dt>Median γ⁰, {b}</dt>
          <dd>{fmtDb(p.median_before_db)}</dd>
        </div>
        <div>
          <dt>Median γ⁰, {a}</dt>
          <dd>{fmtDb(p.median_after_db)}</dd>
        </div>
        <div>
          <dt>Mean change</dt>
          <dd>{fmtDb(p.mean_delta_db, true)}</dd>
        </div>
        <div>
          <dt>Valid in both dates</dt>
          <dd>{Math.round(p.valid_fraction * 100)}% of the area</dd>
        </div>
      </dl>

      <h3>Why we think so</h3>
      <p>
        Pixels were grouped into this area where the signed change {threshold !== undefined ? `passed ±${threshold} dB` : "passed the method’s threshold"}, using only
        pixels valid in both acquisitions from the same orbit track and frame. Method {detail.method?.name ?? "not recorded"} v{evidence?.method_version ?? detail.method?.version ?? "?"}.
      </p>

      <h3>What is uncertain</h3>
      <p>
        This is observed radar change, not a confirmed flood, water change or damage. Tide, rain or wind on water, soil moisture, crops and speckle can all
        change backscatter.{" "}
        {ev.status === "loading"
          ? "Loading reference checks…"
          : ev.status === "ready"
            ? checks.length
              ? `${checks.length} reference check${checks.length > 1 ? "s" : ""} recorded:`
              : "No independent reference check has been recorded for this area yet."
            : `Reference checks couldn’t be loaded (${ev.reason}).`}
      </p>
      {checks.length > 0 && (
        <ul className="c-finding-checks">
          {checks.map((c, i) => (
            <li key={i}>{checkText(c)}</li>
          ))}
        </ul>
      )}

      <h3>Sources</h3>
      <ul className="c-finding-sources">
        {sources.map((s) => (
          <li key={s.granule}>
            <span className="c-mono">{s.granule}</span>
            <small>
              {s.collection}
              {s.version ? `, v${s.version}` : ""}
            </small>
            {s.qa_url && (
              <a href={s.qa_url} target="_blank" rel="noreferrer">
                <FileText size={13} aria-hidden="true" /> QA report
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
