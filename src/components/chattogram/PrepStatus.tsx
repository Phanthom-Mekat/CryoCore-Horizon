"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, KeyRound, LoaderCircle, RotateCw, type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/i18n/format";
import { CASE_ID, isBusy, methodId, type CaseDetail } from "@/lib/chattogram/case-api";
import { useCase } from "./CaseProvider";

const ICON: Record<CaseDetail["status"], LucideIcon> = {
  ready: CheckCircle2,
  not_processed: CircleDashed,
  queued: Clock,
  running: LoaderCircle,
  failed: AlertTriangle,
  needs_credentials: KeyRound,
};

const STATUS: Record<CaseDetail["status"], string> = {
  ready: "Processed",
  not_processed: "Not processed yet",
  queued: "Waiting to be processed",
  running: "Processing",
  failed: "Processing failed",
  needs_credentials: "Needs a NASA Earthdata login",
};

/** The command that prepares the case; it runs on the server, never from this page. */
function Steps({ credentials }: { credentials: boolean }) {
  return (
    <ol className="c-prep-steps">
      {credentials && (
        <li>
          Create a free NASA Earthdata Login and a user token at <span className="c-mono">urs.earthdata.nasa.gov</span>, then add{" "}
          <code>EARTHDATA_TOKEN=&lt;your token&gt;</code> to <code>backend/.env</code>.
        </li>
      )}
      <li>
        From <code>backend/</code>, run <code>python -m app.cli prepare-case {CASE_ID}</code> (with the backend’s virtual environment).
      </li>
      <li>This page checks again on its own while the job runs; otherwise reload it when the command finishes.</li>
    </ol>
  );
}

/** Where the processed case stands: honest preparation status instead of numbers. No button here starts a job. */
export function PrepStatus({ compact = false }: { compact?: boolean }) {
  const { processed, reload } = useCase();

  if (processed.status === "loading")
    return (
      <div className="c-prep is-loading" role="status">
        <p className="c-label">Processed case</p>
        <p className="c-skel-line" aria-hidden="true" />
        <p className="c-hint">Checking the processed case…</p>
      </div>
    );
  if (processed.status !== "ready")
    return (
      <div className="c-prep" role="status">
        <p className="c-label">Processed case</p>
        <h2>{processed.status === "unavailable" ? "The backend doesn’t serve the processed case yet" : "The backend returned an error for the processed case"}</h2>
        <p className="c-hint">
          {processed.reason.replace(/\.?$/, ".")} The scene catalogue, quicklooks and comparisons above still work; calibrated layers and findings appear once the backend
          serves <code>/api/v1/curated-cases/{CASE_ID}</code>.
        </p>
        <button type="button" className="c-btn" onClick={reload}>
          <RotateCw size={15} aria-hidden="true" />
          Check again
        </button>
      </div>
    );

  const d = processed.data.detail;
  const job = d.job;
  const busy = isBusy(d);
  const Icon = ICON[d.status];
  return (
    <div className={`c-prep is-${d.status}`} role="status" aria-live="polite">
      <p className="c-label">Processed case · {d.title}</p>
      <h2 className="c-prep-title">
        <Icon size={18} aria-hidden="true" />
        {STATUS[d.status]}
      </h2>
      {!compact && (
        <p className="c-hint">
          {d.place}. Pair: {fmtDate(d.before.date)} → {fmtDate(d.after.date)} (<span className="c-mono">{d.before.granule}</span> and{" "}
          <span className="c-mono">{d.after.granule}</span>).
        </p>
      )}
      {job && (busy || d.status === "failed") && (
        <dl className="c-facts">
          <div>
            <dt>Job</dt>
            <dd>
              {job.state}
              {job.stage ? ` · ${job.stage}` : ""}
              {job.attempts ? ` · attempt ${job.attempts}` : ""}
            </dd>
          </div>
          {busy && (
            <div>
              <dt>Progress</dt>
              <dd>
                <progress max={1} value={job.progress} aria-label="Processing progress" /> {Math.round(job.progress * 100)}%
              </dd>
            </div>
          )}
          {job.error && (
            <div>
              <dt>Error</dt>
              <dd className="is-warn">{job.error}</dd>
            </div>
          )}
        </dl>
      )}
      {d.status === "needs_credentials" && (
        <>
          <p>The NISAR GCOV files for this pair are behind NASA Earthdata Login, and the backend has no token yet. To prepare the case:</p>
          <Steps credentials />
        </>
      )}
      {d.status === "not_processed" && (
        <>
          <p>The pair is chosen but its calibrated layers haven’t been computed. To prepare the case:</p>
          <Steps credentials={false} />
        </>
      )}
      {d.status === "failed" && (
        <p>
          {job?.retryable === false
            ? "This failure needs a fix before retrying; nothing partial is served."
            : "Nothing partial is served. It is safe to retry: run the same command again."}{" "}
          <code>python -m app.cli prepare-case {CASE_ID}</code> (from <code>backend/</code>)
        </p>
      )}
      {busy && <p className="c-hint">Checked every 3 seconds. Nothing is shown as a result until the whole case is published.</p>}
      {d.status === "ready" && <p className="c-hint">Published {fmtDate(d.updated_at)} · method {methodId(d)}</p>}
    </div>
  );
}
