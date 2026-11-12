"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, KeyRound, LoaderCircle, RotateCw, type LucideIcon } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CASE_ID, isBusy, type CaseDetail } from "@/lib/chattogram/case-api";
import { BackendText } from "./BackendText";
import { MethodName } from "./MethodName";
import { POLL_MS, useCase } from "./CaseProvider";

const ICON: Record<CaseDetail["status"], LucideIcon> = {
  ready: CheckCircle2,
  not_processed: CircleDashed,
  queued: Clock,
  running: LoaderCircle,
  failed: AlertTriangle,
  needs_credentials: KeyRound,
};

// Commands and paths are typed exactly as shown, so they stay English in both languages.
const COMMAND = `python -m app.cli prepare-case ${CASE_ID}`;
const backendDir = (key: string) => (
  <code key={key} lang="en" translate="no">
    backend/
  </code>
);
const command = (key: string) => (
  <code key={key} lang="en" translate="no">
    {COMMAND}
  </code>
);

/** The command that prepares the case; it runs on the server, never from this page. */
function Steps({ credentials }: { credentials: boolean }) {
  const p = useT().prep;
  return (
    <ol className="c-prep-steps">
      {credentials && (
        <li>
          {p.stepToken(
            <span key="site" className="c-mono" lang="en" translate="no">
              urs.earthdata.nasa.gov
            </span>,
            <code key="line" lang="en" translate="no">
              EARTHDATA_TOKEN=&lt;your token&gt;
            </code>,
            <code key="file" lang="en" translate="no">
              backend/.env
            </code>,
          )}
        </li>
      )}
      <li>{p.stepRun(backendDir("dir"), command("cmd"))}</li>
      <li>{p.stepWait}</li>
    </ol>
  );
}

/** Where the processed case stands: honest preparation status instead of numbers. No button here starts a job. */
export function PrepStatus({ compact = false }: { compact?: boolean }) {
  const { processed, reload, source } = useCase();
  const t = useT();
  const p = t.prep;

  if (processed.status === "loading")
    return (
      <div className="c-prep is-loading" role="status">
        <p className="c-label">{p.label}</p>
        <p className="c-skel-line" aria-hidden="true" />
        <p className="c-hint">{p.checking}</p>
      </div>
    );
  if (processed.status !== "ready")
    return (
      <div className="c-prep" role="status">
        <p className="c-label">{p.label}</p>
        <h2>{processed.status === "unavailable" ? p.unavailable : p.failed}</h2>
        <p className="c-hint">
          {source.mode === "frozen" ? (
            p.notFrozen
          ) : (
            // the technical detail is for whoever runs the servers, so it stays as the service reported it
            <span lang="en" translate="no">
              {processed.reason.replace(/\.?$/, ".")}
            </span>
          )}{" "}
          {p.stillWorks(
            <code key="path" lang="en" translate="no">
              /api/v1/curated-cases/{CASE_ID}
            </code>,
          )}
        </p>
        <button type="button" className="c-btn" onClick={reload}>
          <RotateCw size={15} aria-hidden="true" />
          {p.checkAgain}
        </button>
      </div>
    );

  const d = processed.data.detail;
  const job = d.job;
  const busy = isBusy(d);
  const Icon = ICON[d.status];
  return (
    <div className={`c-prep is-${d.status}`} role="status" aria-live="polite">
      <p className="c-label">
        {p.label} · <BackendText text={d.title} translated={t.overview.caseTitles[d.id]} />
      </p>
      <h2 className="c-prep-title">
        <Icon size={18} aria-hidden="true" />
        <BackendText text={d.status} translated={p.status[d.status]} />
      </h2>
      {!compact && (
        <p className="c-hint">
          <BackendText text={d.place} translated={p.places[d.place]} />
          {t.stop}{" "}
          {p.pair(
            fmtDate(d.before.date),
            fmtDate(d.after.date),
            <span key="before" className="c-mono" lang="en" translate="no">
              {d.before.granule}
            </span>,
            <span key="after" className="c-mono" lang="en" translate="no">
              {d.after.granule}
            </span>,
          )}
          {t.stop}
        </p>
      )}
      {job && (busy || d.status === "failed") && (
        <dl className="c-facts">
          <div>
            <dt>{p.job}</dt>
            <dd>
              <BackendText text={job.state} translated={p.jobStates[job.state]} />
              {job.stage && (
                <>
                  {" · "}
                  <BackendText text={job.stage} translated={p.jobStages[job.stage]} />
                </>
              )}
              {job.attempts ? ` · ${p.attempt(fmtNum(job.attempts))}` : ""}
            </dd>
          </div>
          {busy && (
            <div>
              <dt>{p.progress}</dt>
              <dd>
                <progress max={1} value={job.progress} aria-label={p.progressAria} /> {fmtNum(Math.round(job.progress * 100))}%
              </dd>
            </div>
          )}
          {job.error && (
            <div>
              <dt>{p.error}</dt>
              <dd className="is-warn" lang="en" translate="no">
                {job.error}
              </dd>
            </div>
          )}
        </dl>
      )}
      {d.status === "needs_credentials" && (
        <>
          <p>{p.needsCredentials}</p>
          <Steps credentials />
        </>
      )}
      {d.status === "not_processed" && (
        <>
          <p>{p.notProcessed}</p>
          <Steps credentials={false} />
        </>
      )}
      {d.status === "failed" && (
        <p>
          {job?.retryable === false ? p.failedFix : p.failedRetry} {p.runFrom(command("cmd"), backendDir("dir"))}
        </p>
      )}
      {busy && <p className="c-hint">{p.polling(fmtNum(POLL_MS / 1000))}</p>}
      {d.status === "ready" && (
        <p className="c-hint">
          {p.published(fmtDate(d.updated_at))} · {p.method} <MethodName method={d.method} />
        </p>
      )}
    </div>
  );
}
