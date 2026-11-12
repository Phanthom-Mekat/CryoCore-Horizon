import json
import sqlite3
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import jobs, worker
from app.cases import definitions
from app.config import Settings
from app.database import MIGRATIONS, Database
from app.main import create_app

CASE = "karnaphuli-estuary"
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32  # placeholder bytes written by the fake processor in tests only


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)  # never pick up a developer's real ~/.netrc
    return Settings(database_path=tmp_path / "db.sqlite3", data_dir=tmp_path / "data", admin_token="admin-secret",
                    job_max_attempts=2, _env_file=None)


@pytest.fixture
def database(settings):
    db = Database(settings.resolved_database_path)
    db.initialize()
    return db


def seed_scenes(database: Database):
    """Catalog records shaped like CMR UMM for the case's two concept IDs (test fixtures, not NASA data)."""
    p = definitions()[CASE]["properties"]
    with database.connect() as db:
        for key in ("before", "after"):
            ref, name = p[key], p[key]["granule"] + ".h5"
            scene = {
                "concept_id": ref["concept_id"], "revision_id": 1, "granule_id": ref["granule"],
                "collection": "NISAR_L2_GCOV_PROVISIONAL_V1", "product": "GCOV", "start_time": ref["date"],
                "end_time": ref["date"], "spatial_extent": {}, "retrieved_at": "2026-11-12T00:00:00Z",
                "urls": [{"URL": f"https://nisar.asf.earthdatacloud.nasa.gov/NISAR/C/{ref['granule']}/{name}", "Type": "GET DATA"},
                         {"URL": f"https://nisar.asf.earthdatacloud.nasa.gov/NISAR/C/{ref['granule']}/{ref['granule']}_QA_REPORT.pdf"}],
                "metadata": {"umm": {
                    "AdditionalAttributes": [{"Name": "PRODUCT_VERSION", "Values": ["1.0.11"]}],
                    "DataGranule": {"ArchiveAndDistributionInformation": [
                        {"Name": name, "SizeInBytes": 10, "Checksum": {"Value": "0" * 32, "Algorithm": "MD5"}}]}}},
            }
            db.execute("INSERT INTO scenes VALUES (?, 'chattogram-division', 'GCOV', ?, 1, ?)",
                       (ref["concept_id"], ref["date"], json.dumps(scene)))


def fake_downloads(monkeypatch):
    def fake(client, url, dest, auth, size=None, md5=None, progress=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"h5")
        return {"size_bytes": 2, "md5": "x", "reused": False}
    monkeypatch.setattr(worker, "download", fake)
    monkeypatch.setattr(worker, "credentials", lambda settings: ("bearer", "tok"))


def fake_processing(monkeypatch, write=True, error=None):
    """Stand-in for app.processing (written by another module) so these tests cover only the worker."""
    module = types.ModuleType("app.processing")
    module.GcovError = type("GcovError", (ValueError,), {})
    calls = []

    def process_pair(before_h5, after_h5, analysis_area, out_dir, sources, params=None):
        calls.append((Path(before_h5).name, Path(after_h5).name, analysis_area.bounds, [s["granule"] for s in sources]))
        if error:
            raise error(module)
        if not write:
            return {}
        corners = [[91.79, 22.38], [91.9, 22.38], [91.9, 22.24], [91.79, 22.24]]
        layers = []
        for lid, palette in (("before_db", "gray"), ("after_db", "gray"), ("change_db", "diverging")):
            (out_dir / f"{lid}.png").write_bytes(PNG)
            layers.append({"id": lid, "label": lid, "file": f"{lid}.png", "corners": corners, "crs_note": "test",
                           "units": "dB", "scale": {"min": -25, "max": 0}, "palette": palette, "nodata": "transparent"})
        feature = {"type": "Feature", "id": "f1", "geometry": {"type": "Polygon", "coordinates": [corners + [corners[0]]]},
                   "properties": {"id": "f1", "kind": "decrease", "label": "Observed radar change", "area_km2": 1.5,
                                  "mean_delta_db": -4.2, "median_before_db": -8.0, "median_after_db": -12.0,
                                  "valid_fraction": 0.97, "quality": "moderate", "quality_reason": "test"}}
        (out_dir / "findings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [feature]}))
        points = [{"date": "2026-06-18", "granule": sources[0]["granule"], "mean_db": -9.0, "p10_db": -15.0,
                   "p90_db": -4.0, "valid_km2": 150.0}]
        (out_dir / "timeseries.json").write_text(json.dumps({"units": "dB", "points": points}))
        return {"method": {"name": "test-method", "version": "0.0.1", "params": {"threshold_db": 3}},
                "metrics": {"analysis_km2": 175.7, "valid_common_km2": 150.0, "excluded_km2": 25.7,
                            "increase_km2": 0.0, "decrease_km2": 1.5, "threshold_db": 3},
                "caveats": ["test caveat"], "layers": layers, "findings_count": 1, "timeseries_points": points}
    module.process_pair = process_pair
    monkeypatch.setitem(sys.modules, "app.processing", module)
    return calls


V1_DDL = MIGRATIONS[1] + "PRAGMA user_version=1;"


def test_migrates_existing_v1_database_in_place(tmp_path):
    path = tmp_path / "old.sqlite3"
    with sqlite3.connect(path) as old:
        old.executescript(V1_DDL)
        old.execute("INSERT INTO scenes VALUES ('G1', 'chattogram-division', 'GCOV', '2026-01-01', 1, '{}')")
    database = Database(path)
    database.initialize()
    database.initialize()  # idempotent
    with database.connect() as db:
        assert [r[0] for r in db.execute("SELECT version FROM schema_version ORDER BY version")] == [1, 2]
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert db.execute("SELECT payload FROM scenes WHERE concept_id = 'G1'").fetchone()[0] == "{}"
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert {"regions", "cases", "processing_jobs", "assets", "analysis_runs", "findings", "validation_records"} <= tables
        assert db.execute("SELECT stack FROM cases WHERE id = ?", (CASE,)).fetchone()[0] == "069_A_013"


def test_newer_schema_is_refused(tmp_path):
    path = tmp_path / "new.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA user_version=99")
    with pytest.raises(RuntimeError, match="newer"):
        Database(path).initialize()


def test_enqueue_is_idempotent_and_claim_is_atomic(database):
    first = jobs.enqueue(database, CASE)
    assert jobs.enqueue(database, CASE) == first
    with pytest.raises(KeyError):
        jobs.enqueue(database, "nowhere")
    claimed = jobs.claim(database)
    assert claimed["id"] == first and claimed["state"] == "running" and claimed["attempts"] == 1
    assert jobs.claim(database) is None and jobs.claim(database, first) is None
    assert jobs.enqueue(database, CASE) == first  # still active while running


def test_stale_running_jobs_are_requeued_then_failed(database, settings):
    job_id = jobs.enqueue(database, CASE)
    for expected in ("queued", "failed"):
        jobs.claim(database, job_id)
        with database.connect() as db:
            db.execute("UPDATE processing_jobs SET heartbeat_at = '2000-01-01T00:00:00+00:00' WHERE id = ?", (job_id,))
        assert jobs.recover_stale(database, settings) == 1
        assert jobs.get(database, job_id)["state"] == expected
    assert jobs.get(database, job_id)["error_code"] == "worker_lost"


def test_missing_credentials_fail_job_and_case_shows_needs_credentials(database, settings):
    seed_scenes(database)
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["state"] == "failed" and job["error_code"] == "needs_credentials" and not job["retryable"]
    assert "CRYO_EARTHDATA_TOKEN" in job["error"] and "Generate Token" in job["error"]
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/cases").json()[0]["status"] == "needs_credentials"
        detail = client.get(f"/api/v1/cases/{CASE}").json()
        assert detail["job"]["state"] == "failed" and detail["metrics"] is None
        assert detail["sources"][0]["size_bytes"] == 10  # provenance from the local catalog


def test_missing_catalog_records_give_an_actionable_error(database, settings):
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["error_code"] == "catalog_missing" and "app.cli sync" in job["error"]


def test_worker_publishes_bundle_atomically_and_is_rerunnable(database, settings, monkeypatch):
    seed_scenes(database)
    fake_downloads(monkeypatch)
    calls = fake_processing(monkeypatch)
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["state"] == "succeeded" and job["progress"] == 1.0, job
    p = definitions()[CASE]["properties"]
    assert calls == [(p["before"]["granule"] + ".h5", p["after"]["granule"] + ".h5", (91.79, 22.24, 91.9, 22.38),
                      [p["before"]["granule"], p["after"]["granule"]])]
    bundle = settings.resolved_data_dir / "cases" / CASE
    manifest = json.loads((bundle / "manifest.json").read_text())
    assert manifest["job_id"] == job["id"] and manifest["sources"][1]["concept_id"] == p["after"]["concept_id"]
    assert not list(bundle.parent.glob(".tmp-*")) and not list(bundle.parent.glob(".old-*"))
    second = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert second["id"] != job["id"] and second["state"] == "succeeded"
    with database.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM findings").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM analysis_runs").fetchone()[0] == 2
        assert db.execute("SELECT size_bytes FROM assets WHERE kind = 'source_h5'").fetchone()[0] == 2


def test_incomplete_output_is_never_published(database, settings, monkeypatch):
    seed_scenes(database)
    fake_downloads(monkeypatch)
    fake_processing(monkeypatch, write=False)
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["state"] == "failed" and job["error_code"] == "incomplete_output"
    assert not (settings.resolved_data_dir / "cases" / CASE).exists()
    assert not list((settings.resolved_data_dir / "cases").glob(".tmp-*"))


def test_science_rejection_and_retry_limits(database, settings, monkeypatch):
    seed_scenes(database)
    fake_downloads(monkeypatch)
    fake_processing(monkeypatch, error=lambda m: m.GcovError("no valid pixel on both dates"))
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert (job["state"], job["error_code"], job["error"], job["attempts"]) == \
        ("failed", "processing_rejected", "no valid pixel on both dates", 1)

    monkeypatch.setattr(worker.time, "sleep", lambda s: None)
    fake_processing(monkeypatch, error=lambda m: RuntimeError(str(settings.resolved_data_dir)))
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["state"] == "failed" and job["attempts"] == settings.job_max_attempts and job["retryable"]
    assert str(settings.resolved_data_dir) not in job["error"]  # no server paths in public errors


def test_job_api_is_protected(settings, database):
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/v1/jobs", json={"case_id": CASE}).status_code == 403
        assert client.post("/api/v1/jobs", json={"case_id": CASE}, headers={"X-Admin-Token": "nope"}).status_code == 403
        ok = client.post("/api/v1/jobs", json={"case_id": CASE}, headers={"X-Admin-Token": "admin-secret"})
        assert ok.status_code == 202
        again = client.post("/api/v1/jobs", json={"case_id": CASE}, headers={"X-Admin-Token": "admin-secret"})
        assert again.json() == ok.json()
        assert client.post("/api/v1/jobs", json={"case_id": "x"}, headers={"X-Admin-Token": "admin-secret"}).status_code == 404
        job = client.get(f"/api/v1/jobs/{ok.json()['job_id']}").json()
        assert job["state"] == "queued" and job["case_id"] == CASE and job["attempts"] == 0
        assert client.get("/api/v1/jobs/999").status_code == 404
        assert client.get("/api/v1/cases").json()[0]["status"] == "queued"
    disabled = settings.model_copy(update={"admin_token": None})
    with TestClient(create_app(disabled)) as client:
        response = client.post("/api/v1/jobs", json={"case_id": CASE}, headers={"X-Admin-Token": ""})
        assert response.status_code == 403 and response.json()["detail"] == "job creation disabled"


def test_synthetic_fixture_bundle_runs_real_pipeline_but_is_served_only_for_qa(database, settings):
    from qa_synthetic_case import publish_synthetic  # generates fixture HDF5 into tmp_path at test time only

    job = publish_synthetic(database, settings)
    assert job["state"] == "succeeded", job
    manifest = json.loads((settings.resolved_data_dir / "cases" / CASE / "manifest.json").read_text())
    assert manifest["synthetic_fixture"] is True and manifest["caveats"][0].startswith("SYNTHETIC QA DATA")

    with TestClient(create_app(settings)) as client:  # default: refused, as if never published
        case = client.get(f"/api/v1/cases/{CASE}").json()
        assert case["status"] == "not_processed" and case["synthetic_fixture"] is False and case["metrics"] is None
        assert client.get(f"/api/v1/cases/{CASE}/layers").json() == []
        assert client.get(f"/api/v1/cases/{CASE}/findings").json()["features"] == []
        assert client.get(f"/api/v1/cases/{CASE}/assets/change_db.png").status_code == 404
        assert client.get(f"/api/v1/cases/{CASE}/export").status_code == 409

    qa = settings.model_copy(update={"allow_synthetic_qa": True})
    with TestClient(create_app(qa)) as client:
        case = client.get(f"/api/v1/cases/{CASE}").json()
        assert case["status"] == "ready" and case["synthetic_fixture"] is True
        assert client.get("/api/v1/cases").json()[0]["synthetic_fixture"] is True
        assert {(f["properties"]["kind"]) for f in client.get(f"/api/v1/cases/{CASE}/findings").json()["features"]} \
            == {"increase", "decrease"}
        layers = client.get(f"/api/v1/cases/{CASE}/layers").json()
        assert [layer["id"] for layer in layers] == ["before_db", "after_db", "change_db"]
        png = client.get(layers[2]["url"])
        assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
        assert client.get(f"/api/v1/cases/{CASE}/export").json()["provenance"]["synthetic_fixture"] is True
