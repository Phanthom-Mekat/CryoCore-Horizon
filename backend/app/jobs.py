"""Durable SQLite job queue: atomic claiming, one active job per case, stale-job recovery."""
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException

from .config import Settings
from .database import Database, now_iso
from .schemas import Job, JobCreate, JobCreated

ACTIVE = ("queued", "running")


def _job(row) -> dict | None:
    if row is None:
        return None
    job = dict(row)
    job["retryable"] = bool(job["retryable"])
    return job


def enqueue(database: Database, case_id: str) -> int:
    """Queue a job for a case, or return the case's already active job (idempotent)."""
    with database.connect() as db:
        if not db.execute("SELECT 1 FROM cases WHERE id = ?", (case_id,)).fetchone():
            raise KeyError(case_id)
        try:
            return db.execute("INSERT INTO processing_jobs(case_id, state, stage, created_at) VALUES (?, 'queued', 'queued', ?)",
                              (case_id, now_iso())).lastrowid
        except sqlite3.IntegrityError:  # processing_jobs_one_active
            return db.execute("SELECT id FROM processing_jobs WHERE case_id = ? AND state IN ('queued', 'running')",
                              (case_id,)).fetchone()[0]


def get(database: Database, job_id: int) -> dict | None:
    with database.connect() as db:
        return _job(db.execute("SELECT * FROM processing_jobs WHERE id = ?", (job_id,)).fetchone())


def latest_for_case(db, case_id: str) -> dict | None:
    return _job(db.execute("SELECT * FROM processing_jobs WHERE case_id = ? ORDER BY id DESC LIMIT 1",
                           (case_id,)).fetchone())


def claim(database: Database, job_id: int | None = None) -> dict | None:
    """Atomically move one queued job (the oldest, or job_id) to running. Only one claimer can win."""
    now = now_iso()
    target = "?" if job_id is not None else "(SELECT id FROM processing_jobs WHERE state = 'queued' ORDER BY id LIMIT 1)"
    with database.connect() as db:
        return _job(db.execute(f"""
            UPDATE processing_jobs SET state = 'running', attempts = attempts + 1, started_at = ?, heartbeat_at = ?,
                   error = NULL, error_code = NULL, retryable = 0
            WHERE id = {target} AND state = 'queued' RETURNING *""",
            (now, now, *([job_id] if job_id is not None else []))).fetchone())


def update(database: Database, job_id: int, **fields):
    """Update a job's fields. A cancelled job is final: nothing (progress, success, failure, requeue) overwrites it."""
    fields["heartbeat_at"] = now_iso()
    with database.connect() as db:
        db.execute(f"UPDATE processing_jobs SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ? AND state != 'cancelled'",
                   (*fields.values(), job_id))


def cancel(database: Database, job_id: int) -> dict | None:
    """Cancel a queued or running job. Returns the cancelled job, or None if it was not active.
    A running worker notices at its next progress check and stops without publishing."""
    with database.connect() as db:
        return _job(db.execute("""UPDATE processing_jobs SET state = 'cancelled', error = 'Cancelled by an operator.',
                                  error_code = 'cancelled', retryable = 0, finished_at = ?
                                  WHERE id = ? AND state IN ('queued', 'running') RETURNING *""",
                               (now_iso(), job_id)).fetchone())


def is_cancelled(database: Database, job_id: int) -> bool:
    with database.connect() as db:
        row = db.execute("SELECT state FROM processing_jobs WHERE id = ?", (job_id,)).fetchone()
    return row is not None and row["state"] == "cancelled"


def fail(database: Database, settings: Settings, job: dict, code: str, message: str, retryable: bool) -> dict:
    """Requeue a retryable failure while attempts remain; otherwise mark it failed."""
    again = retryable and job["attempts"] < settings.job_max_attempts
    update(database, job["id"], state="queued" if again else "failed", error=message, error_code=code,
           retryable=int(retryable), finished_at=None if again else now_iso())
    return get(database, job["id"])


def recover_stale(database: Database, settings: Settings) -> int:
    """Requeue (or fail, if out of attempts) running jobs whose worker stopped sending heartbeats."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=settings.job_stale_seconds)).isoformat()
    with database.connect() as db:
        rows = db.execute("SELECT * FROM processing_jobs WHERE state = 'running' AND heartbeat_at < ?", (cutoff,)).fetchall()
    for row in rows:
        fail(database, settings, _job(row), "worker_lost", "The worker stopped before finishing; the job was requeued.", True)
    return len(rows)


def router(database: Database, settings: Settings) -> APIRouter:
    api = APIRouter(prefix="/api/v1", tags=["Processing jobs"])

    def require_admin(token: str | None):
        expected = settings.admin_token.get_secret_value() if settings.admin_token else ""
        if not expected:
            raise HTTPException(status_code=403, detail="job creation disabled")
        if not token or not secrets.compare_digest(token.encode(), expected.encode()):
            raise HTTPException(status_code=403, detail="invalid admin token")

    @api.post("/jobs", status_code=202, response_model=JobCreated)
    def create_job(body: JobCreate, x_admin_token: str | None = Header(default=None)):
        require_admin(x_admin_token)
        try:
            return {"job_id": enqueue(database, body.case_id)}
        except KeyError:
            raise HTTPException(status_code=404, detail="Unknown case.") from None

    @api.get("/jobs/{job_id}", response_model=Job)
    def job(job_id: int):
        found = get(database, job_id)
        if found is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        return found

    @api.post("/jobs/{job_id}/cancel", response_model=Job)
    def cancel_job(job_id: int, x_admin_token: str | None = Header(default=None)):
        require_admin(x_admin_token)
        cancelled = cancel(database, job_id)
        if cancelled is not None:
            return cancelled
        if get(database, job_id) is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        raise HTTPException(status_code=409, detail="Only a queued or running job can be cancelled.")

    return api
