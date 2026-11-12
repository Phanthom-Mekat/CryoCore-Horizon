"""Processing worker: python -m app.worker [--once]

Claims queued jobs from SQLite, downloads the case's two GCOV files, runs app.processing.process_pair into a
temporary directory and publishes the bundle atomically to data/cases/<case_id>/. Safe to restart: interrupted
downloads resume, stale running jobs are requeued, and a half-written bundle is never served.
"""
import argparse
import json
import shutil
import time
import traceback
from pathlib import Path

import httpx
from shapely.geometry import shape

from . import jobs
from .cases import REQUIRED_FILES, bundle_dir, source_info
from .config import Settings
from .database import Database, now_iso
from .download import DownloadError, credentials, download, h5_source


class JobFailure(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.retryable = code, retryable


def run_job(database: Database, settings: Settings, job_id: int | None = None) -> dict | None:
    """Run one job to completion. With job_id, keep retrying it (with backoff) until it stops being queued."""
    while True:
        job = jobs.claim(database, job_id)
        if job is None:
            return jobs.get(database, job_id) if job_id is not None else None
        try:
            _execute(database, settings, job)
            jobs.update(database, job["id"], state="succeeded", stage="published", progress=1.0, finished_at=now_iso())
        except (JobFailure, DownloadError) as exc:
            jobs.fail(database, settings, job, exc.code, str(exc), exc.retryable)
        except KeyboardInterrupt:
            jobs.update(database, job["id"], state="queued", error="Interrupted; will resume.", error_code="interrupted",
                        retryable=1, attempts=job["attempts"] - 1)  # an operator stop is not a failed attempt
            raise
        except Exception as exc:  # unknown: log the detail here, expose only the type through the API
            traceback.print_exc()
            jobs.fail(database, settings, job, "error", f"Processing failed ({type(exc).__name__}); see the worker log.", True)
        result = jobs.get(database, job["id"])
        if job_id is None or result["state"] != "queued":
            return result
        time.sleep(min(60, 5 * result["attempts"]))


def _execute(database: Database, settings: Settings, job: dict):
    case_id, job_id = job["case_id"], job["id"]
    jobs.update(database, job_id, stage="resolve", progress=0.0)
    with database.connect() as db:
        case = db.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        scenes = {}
        for key in ("before", "after"):
            cid = case[f"{key}_concept_id"]
            row = db.execute("SELECT payload FROM scenes WHERE concept_id = ?", (cid,)).fetchone()
            if row is None:
                raise JobFailure("catalog_missing", f"Scene {cid} is not in the local catalog. Run "
                                 "'python -m app.cli sync --start 2026-01-01' from backend/ first.")
            scenes[key] = json.loads(row["payload"])
    definition = json.loads(case["definition"])

    # Download (resumable). Credentials are checked before any network call.
    jobs.update(database, job_id, stage="download", progress=0.02)
    auth = credentials(settings)
    raw = settings.resolved_data_dir / "raw"
    files, sources = {}, []
    with httpx.Client(timeout=httpx.Timeout(60, connect=30), headers={"User-Agent": "CryoCore-Horizon/0.1"}) as client:
        for index, key in enumerate(("before", "after")):
            src = h5_source(scenes[key])
            if not src["url"]:
                raise JobFailure("catalog_missing", f"No HDF5 download URL in the catalog for {scenes[key]['granule_id']}.")
            last = [0.0]

            def progress(done, total, index=index):
                if total and time.monotonic() - last[0] > 2:
                    last[0] = time.monotonic()
                    jobs.update(database, job_id, progress=round(0.02 + 0.8 * (index + done / total) / 2, 4))

            got = download(client, src["url"], raw / src["name"], auth, src["size_bytes"], src["md5"], progress)
            files[key] = raw / src["name"]
            sources.append(source_info(scenes[key]))
            _record_asset(database, case_id, "source_h5", src["name"], scenes[key], got["size_bytes"], got["md5"])

    process_files(database, settings, job, definition, files, sources)


def process_files(database: Database, settings: Settings, job: dict, definition: dict, files: dict, sources: list):
    """Process local before/after files into a temporary directory next to the final one (same disk, so the
    rename is atomic), then publish. files: {"before": Path, "after": Path}; sources: [before, after] SourceRefs."""
    case_id, job_id = job["case_id"], job["id"]
    jobs.update(database, job_id, stage="process", progress=0.85)
    try:
        from .processing import GcovError, process_pair
    except ImportError as exc:
        raise JobFailure("processing_unavailable", "The processing module (app.processing) is not installed yet.") from exc
    final = bundle_dir(settings, case_id)
    tmp = final.with_name(f".tmp-{case_id}-{job_id}")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    try:
        _process_and_publish(database, job_id, case_id, definition, process_pair, files, sources, tmp, final)
    except GcovError as exc:  # the science module's plain-language "the data cannot support this"
        raise JobFailure("processing_rejected", str(exc)) from exc
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _process_and_publish(database, job_id, case_id, definition, process_pair, files, sources, tmp: Path, final: Path):
    result = process_pair(files["before"], files["after"], shape(definition["geometry"]), tmp, sources, None)
    jobs.update(database, job_id, stage="publish", progress=0.97)
    manifest_path = tmp / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.update(result or {})
    manifest.update(case_id=case_id, job_id=job_id, sources=sources, published_at=now_iso(),
                    before=definition["properties"]["before"], after=definition["properties"]["after"],
                    synthetic_fixture=bool(manifest.get("synthetic_fixture")))  # always explicit; the API gates on it
    manifest_path.write_text(json.dumps(manifest, indent=2))
    missing = [name for name in REQUIRED_FILES if not (tmp / name).is_file()]
    if missing:
        raise JobFailure("incomplete_output", f"Processing did not write {', '.join(missing)}; nothing was published.")
    _publish(tmp, final)
    _record_run(database, case_id, job_id, manifest, final)


def _publish(tmp: Path, final: Path):
    """Swap the finished bundle into place. Readers see the old bundle or the new one, never a partial one."""
    old = final.with_name(f".old-{final.name}-{time.time_ns()}")
    if final.exists():
        final.rename(old)
    tmp.rename(final)
    shutil.rmtree(old, ignore_errors=True)


def _record_asset(database, case_id, kind, name, scene, size, md5):
    with database.connect() as db:
        db.execute("""INSERT INTO assets(case_id, kind, name, concept_id, revision_id, size_bytes, md5, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(case_id, kind, name) DO UPDATE SET
                      size_bytes = excluded.size_bytes, md5 = excluded.md5, created_at = excluded.created_at""",
                   (case_id, kind, name, scene and scene["concept_id"], scene and scene["revision_id"], size, md5, now_iso()))


def _record_run(database, case_id, job_id, manifest, final: Path):
    method = manifest.get("method") or {}
    features = json.loads((final / "findings.geojson").read_text()).get("features", [])
    with database.connect() as db:
        run_id = db.execute("""INSERT INTO analysis_runs(case_id, job_id, method_name, method_version, params, metrics,
                               sources, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                            (case_id, job_id, method.get("name"), method.get("version"), json.dumps(method.get("params", {})),
                             json.dumps(manifest.get("metrics")), json.dumps(manifest["sources"]), manifest["published_at"])).lastrowid
        db.execute("DELETE FROM findings WHERE case_id = ?", (case_id,))
        for f in features:
            p = f["properties"]
            db.execute("INSERT INTO findings VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (str(p["id"]), case_id, run_id, p.get("kind", ""), p.get("quality"), json.dumps(p), json.dumps(f["geometry"])))
    for path in final.iterdir():
        _record_asset(database, case_id, "bundle", path.name, None, path.stat().st_size, None)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m app.worker")
    parser.add_argument("--once", action="store_true", help="Process at most one job, then exit")
    parser.add_argument("--poll", type=float, default=5.0, help="Seconds between queue checks when idle")
    args = parser.parse_args(argv)
    settings = Settings()
    database = Database(settings.resolved_database_path)
    database.initialize()
    print("worker started; Ctrl+C to stop", flush=True)
    try:
        while True:
            if recovered := jobs.recover_stale(database, settings):
                print(f"requeued {recovered} stale job(s)", flush=True)
            job = run_job(database, settings)
            if job:
                print(f"job {job['id']} ({job['case_id']}): {job['state']}" + (f" - {job['error']}" if job["error"] else ""), flush=True)
            if args.once:
                return
            if job is None:
                time.sleep(args.poll)
    except KeyboardInterrupt:
        print("worker stopped", flush=True)


if __name__ == "__main__":
    main()
