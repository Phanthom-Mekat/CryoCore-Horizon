"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { api, toLoadError, type Load } from "@/lib/chattogram/api";
import { fmtArea, fmtDate, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CASE_ID, type CaseDetail, type Finding, type FindingDetail } from "@/lib/chattogram/case-api";
import { BackendText } from "./BackendText";
import { FINDING } from "./MapKey";
import { useCase } from "./CaseProvider";

/** A reference check (backend validation_records row): its label, source, date and notes, else the raw record. */
function Check({ check }: { check: unknown }) {
  const r = (check && typeof check === "object" ? check : {}) as { label?: string; reference_source?: string; observed_at?: string; notes?: string };
  const parts = [
    r.label && <BackendText key="label" text={r.label} />,
    r.reference_source && <BackendText key="source" text={r.reference_source} />,
    r.observed_at && fmtDate(r.observed_at),
    r.notes && <BackendText key="notes" text={r.notes} />,
  ].filter(Boolean);
  if (!parts.length) return <span lang="en" translate="no">{JSON.stringify(check)}</span>;
  return <>{parts.flatMap((p, i) => (i ? [" · ", p] : [p]))}</>;
}

/** Click-to-explain (F07): what changed, why we think so, what is uncertain, and where every number comes from. */
export function FindingPanel({ finding, detail, onClose }: { finding: Finding; detail: CaseDetail; onClose: () => void }) {
  const p = finding.properties;
  const t = useT();
  const f = t.finding;
  const { source, frozenCurated } = useCase();
  const frozen = source.mode === "frozen";
  const frozenEv = frozen ? frozenCurated?.findingDetails[p.id] : undefined;
  const [liveEv, setEv] = useState<Load<FindingDetail>>({ status: "loading" });
  const ev: Load<FindingDetail> = !frozen ? liveEv : frozenEv ? { status: "ready", data: frozenEv } : { status: "unavailable", reason: "" };
  useEffect(() => {
    if (frozen) return; // the snapshot holds every finding's evidence
    let live = true;
    api.finding(CASE_ID, p.id).then(
      (d) => live && setEv({ status: "ready", data: d }),
      (e) => live && setEv(toLoadError(e)),
    );
    return () => {
      live = false;
    };
  }, [p.id, frozen]);

  const k = FINDING[p.kind];
  const [b, a] = [fmtDate(detail.before.date), fmtDate(detail.after.date)];
  const area = fmtArea(p.area_km2);
  const delta = `${fmtSigned(p.mean_delta_db, 1)} dB`;
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
          <BackendText text={p.label} translated={f.labels[p.label]} /> ·{" "}
          <span lang="en" translate="no">
            {p.id}
          </span>
        </p>
        <button type="button" className="c-btn c-finding-close" onClick={onClose} aria-label={f.close}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <h2 id="finding-h" className="c-acq-date">
        <BackendText text={p.kind} translated={f.kind[p.kind]} />, {area} km²
      </h2>
      <p className={`c-quality is-${p.quality}`}>
        <strong>
          <BackendText text={p.quality} translated={f.quality[p.quality]} />
        </strong> <BackendText text={p.quality_reason} />
      </p>

      <h3>{f.whatChanged}</h3>
      <p>
        {f.changedLead(b, a, area)} <strong>{delta}</strong>
        {f.changedTail}
        {t.stop}
      </p>
      <dl className="c-facts">
        <div>
          <dt>{f.medianOn(b)}</dt>
          <dd>{fmtNum(p.median_before_db, 1)} dB</dd>
        </div>
        <div>
          <dt>{f.medianOn(a)}</dt>
          <dd>{fmtNum(p.median_after_db, 1)} dB</dd>
        </div>
        <div>
          <dt>{f.meanChange}</dt>
          <dd>{delta}</dd>
        </div>
        <div>
          <dt>{f.validBoth}</dt>
          <dd>{f.validShare(fmtNum(Math.round(p.valid_fraction * 100)))}</dd>
        </div>
      </dl>

      <h3>{f.why}</h3>
      <p>
        {f.whyBody(threshold !== undefined ? f.ruleThreshold(fmtNum(threshold)) : f.ruleUnknown)}{" "}
        {f.method} {detail.method ? <BackendText text={detail.method.name} translated={f.methodNames[detail.method.name]} /> : f.methodNone}{" "}
        <span lang="en" translate="no">
          v{evidence?.method_version ?? detail.method?.version ?? "?"}
        </span>
        {t.stop}
      </p>

      <h3>{f.uncertain}</h3>
      <p>
        {f.uncertainBody}{" "}
        {ev.status === "loading" ? (
          f.checksLoading
        ) : ev.status === "ready" ? (
          checks.length ? (
            f.checksRecorded(fmtNum(checks.length))
          ) : (
            f.checksNone
          )
        ) : frozen ? (
          f.checksNotFrozen
        ) : (
          <>
            {f.checksFailed} (
            <span lang="en" translate="no">
              {ev.reason}
            </span>
            ){t.stop}
          </>
        )}
      </p>
      {checks.length > 0 && (
        <ul className="c-finding-checks">
          {checks.map((c, i) => (
            <li key={i}>
              <Check check={c} />
            </li>
          ))}
        </ul>
      )}

      <h3>{f.sources}</h3>
      <ul className="c-finding-sources">
        {sources.map((s) => (
          <li key={s.granule}>
            <span className="c-mono" lang="en" translate="no">
              {s.granule}
            </span>
            <small lang="en" translate="no">
              {s.collection}
              {s.version ? `, v${s.version}` : ""}
            </small>
            {s.qa_url && (
              <a href={s.qa_url} target="_blank" rel="noreferrer">
                <FileText size={13} aria-hidden="true" /> {f.qaReport}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
