"""QA only: publish a SYNTHETIC karnaphuli-estuary bundle into a data dir outside the repo, to exercise the ready path.

    # from backend/, with both paths pointing outside the repository (e.g. under %TEMP%)
    CRYO_DATA_DIR=... CRYO_DATABASE_PATH=... .venv/Scripts/python.exe tests/qa_synthetic_case.py

The inputs are generated test fixtures (tests/fixtures/synthetic_gcov.py), never NISAR data. The real worker path
(app.worker.process_files -> app.processing.process_pair -> atomic publish) flags the bundle synthetic_fixture, and the
API serves such a bundle only when CRYO_ALLOW_SYNTHETIC_QA=1. Refuses to write anywhere inside the repository.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/, when run as a script

from shapely.geometry import shape  # noqa: E402

from app import jobs, worker  # noqa: E402
from app.cases import definitions  # noqa: E402
from app.config import BACKEND_ROOT, Settings  # noqa: E402
from app.database import Database, now_iso  # noqa: E402
from fixtures.synthetic_gcov import make_gcov  # noqa: E402

CASE = "karnaphuli-estuary"
SIZE = (900, 700)  # 18 x 14 km at 20 m, enough to cover the ~11 x 15.5 km rectangle


def publish_synthetic(database: Database, settings: Settings) -> dict:
    repo = BACKEND_ROOT.parent.resolve()
    for path in (settings.resolved_data_dir, settings.resolved_database_path):
        if path.is_relative_to(repo):
            raise SystemExit(f"refusing: {path} is inside the repository. Point CRYO_DATA_DIR and CRYO_DATABASE_PATH "
                             "at a temporary folder.")
    definition = definitions()[CASE]
    props, c = definition["properties"], shape(definition["geometry"]).centroid
    raw = settings.resolved_data_dir / "raw-synthetic"
    raw.mkdir(parents=True, exist_ok=True)
    common = dict(size=SIZE, center=(c.x, c.y), invalid_boxes=[(91.88, 22.36, 400)])
    files = {
        "before": make_gcov(raw / "SYNTHETIC_before.h5", seed=1, start=props["before"]["date"], **common),
        "after": make_gcov(raw / "SYNTHETIC_after.h5", seed=2, start=props["after"]["date"],
                           plants=[(91.82, 22.30, 500, 8.0), (91.86, 22.27, 350, -7.0)], **common),
    }
    # The case's granule ids are kept so the UI can match its pair; the collection says what the data really is.
    sources = [{"granule": props[k]["granule"], "concept_id": props[k]["concept_id"],
                "collection": "SYNTHETIC_QA_FIXTURE_NOT_NISAR", "version": None, "md5": None, "size_bytes": None,
                "qa_url": None} for k in ("before", "after")]
    job = jobs.claim(database, jobs.enqueue(database, CASE))
    try:
        worker.process_files(database, settings, job, definition, files, sources)
    except BaseException as exc:
        jobs.fail(database, settings, job, "qa_failed", f"Synthetic QA run failed ({type(exc).__name__}).", False)
        raise
    jobs.update(database, job["id"], state="succeeded", stage="published", progress=1.0, finished_at=now_iso())
    return jobs.get(database, job["id"])


if __name__ == "__main__":
    settings = Settings()
    database = Database(settings.resolved_database_path)
    database.initialize()
    job = publish_synthetic(database, settings)
    print(f"job {job['id']}: {job['state']}; SYNTHETIC bundle at {settings.resolved_data_dir / 'cases' / CASE}")
