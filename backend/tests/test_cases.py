import csv
import io
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import jobs, worker
from app.cases import list_cases, read_case
from app.main import create_app
from test_jobs import CASE, PNG, database, fake_downloads, fake_processing, seed_scenes, settings  # noqa: F401


EMPTY_SENSITIVITY = {"units": "dB", "published_threshold_db": None, "note": None, "rows": [], "highest_threshold_by_finding": {}}
SENSITIVITY = {"units": "dB", "published_threshold_db": 3.0, "note": "test",
               "rows": [{"threshold_db": 3.0, "increase_km2": 0.0, "decrease_km2": 1.5, "increase_regions": 0,
                         "decrease_regions": 1, "listed_findings_present": 1}],
               "highest_threshold_by_finding": {"f1": 3.0}}


def offline():
    def no_network(request):
        pytest.fail("case replay must not call NASA")
    return httpx.MockTransport(no_network)


def test_unprocessed_case_is_honest(settings, database):
    with TestClient(create_app(settings, offline())) as client:
        cases = client.get("/api/v1/curated-cases").json()
        assert [c["id"] for c in cases] == [CASE]
        case = cases[0]
        assert case["status"] == "not_processed" and case["stack"] == "069_A_013"
        assert case["before"]["date"].startswith("2026-06-18") and case["after"]["date"].startswith("2026-10-16")
        assert case["analysis_area"]["properties"]["provenance"] == \
            "team-drawn analysis rectangle, not an administrative boundary"
        detail = client.get(f"/api/v1/curated-cases/{CASE}").json()
        assert detail["metrics"] is None and detail["method"] is None and detail["job"] is None
        assert any("Not processed" in c for c in detail["caveats"])
        assert client.get(f"/api/v1/curated-cases/{CASE}/layers").json() == []
        assert client.get(f"/api/v1/curated-cases/{CASE}/findings").json() == {"type": "FeatureCollection", "features": []}
        assert client.get(f"/api/v1/curated-cases/{CASE}/timeseries").json() == {"units": "dB", "points": []}
        assert client.get(f"/api/v1/curated-cases/{CASE}/sensitivity").json() == EMPTY_SENSITIVITY
        assert client.get(f"/api/v1/curated-cases/{CASE}/assets/before_db.png").status_code == 404
        assert client.get(f"/api/v1/curated-cases/{CASE}/export").status_code == 409
        assert client.get("/api/v1/curated-cases/elsewhere").status_code == 404
        assert client.get("/api/v1/curated-cases/elsewhere/layers").status_code == 404


def test_ready_case_replays_from_bundle(settings, database, monkeypatch):
    seed_scenes(database)
    fake_downloads(monkeypatch)
    fake_processing(monkeypatch)
    job = worker.run_job(database, settings, jobs.enqueue(database, CASE))
    assert job["state"] == "succeeded"
    with database.connect() as db:
        db.execute("INSERT INTO validation_records(case_id, finding_id, reference_source, label, created_at) "
                   "VALUES (?, 'f1', 'test reference', 'not yet checked', '2026-11-12')", (CASE,))

    with TestClient(create_app(settings, offline())) as client:
        texts = []
        case = client.get(f"/api/v1/curated-cases/{CASE}").json()
        texts.append(str(case))
        assert case["status"] == "ready" and case["metrics"]["decrease_km2"] == 1.5
        assert case["method"]["version"] == "0.0.1" and case["job"]["state"] == "succeeded"

        layers = client.get(f"/api/v1/curated-cases/{CASE}/layers").json()
        texts.append(str(layers))
        assert [l["id"] for l in layers] == ["before_db", "after_db", "change_db"]
        url = layers[0]["url"]
        assert url == f"/api/v1/curated-cases/{CASE}/assets/before_db.png?v={job['id']}"
        png = client.get(url)
        assert png.status_code == 200 and png.content == PNG and png.headers["content-type"] == "image/png"
        assert "max-age=31536000" in png.headers["cache-control"]
        for bad in ("manifest.json", "..%2Fmanifest.json", "%2E%2E%2F%2E%2E%2Fdb.sqlite3", "BEFORE_DB.png", "x.png"):
            assert client.get(f"/api/v1/curated-cases/{CASE}/assets/{bad}").status_code == 404, bad

        findings = client.get(f"/api/v1/curated-cases/{CASE}/findings").json()
        assert findings["features"][0]["properties"]["label"] == "Observed radar change"
        finding = client.get("/api/v1/findings/f1").json()
        texts.append(str(finding))
        assert finding["case_id"] == CASE and finding["evidence"]["method_version"] == "0.0.1"
        assert finding["evidence"]["params"] == {"threshold_db": 3}
        assert finding["evidence"]["reference_checks"][0]["reference_source"] == "test reference"
        assert len(finding["evidence"]["sources"]) == 2
        assert client.get("/api/v1/findings/nope").status_code == 404
        assert client.get(f"/api/v1/curated-cases/{CASE}/timeseries").json()["points"][0]["mean_db"] == -9.0
        # a bundle published before the sensitivity file existed: empty, not an error
        assert client.get(f"/api/v1/curated-cases/{CASE}/sensitivity").json() == EMPTY_SENSITIVITY
        bundle = settings.resolved_data_dir / "cases" / CASE
        (bundle / "sensitivity.json").write_text(json.dumps(SENSITIVITY))
        assert client.get(f"/api/v1/curated-cases/{CASE}/sensitivity").json() == SENSITIVITY
        assert client.get("/api/v1/curated-cases/elsewhere/sensitivity").status_code == 404

        exported = client.get(f"/api/v1/curated-cases/{CASE}/export?format=json")
        texts.append(exported.text)
        assert exported.headers["content-disposition"].startswith("attachment;")
        assert exported.json()["provenance"]["sources"][0]["concept_id"] == case["before"]["concept_id"]
        geo = client.get(f"/api/v1/curated-cases/{CASE}/export?format=geojson")
        assert geo.headers["content-type"].startswith("application/geo+json")
        assert geo.json()["provenance"]["method"]["version"] == "0.0.1" and len(geo.json()["features"]) == 1
        rows = list(csv.DictReader(io.StringIO(client.get(f"/api/v1/curated-cases/{CASE}/export?format=csv").text)))
        assert rows[0]["id"] == "f1" and rows[0]["before_granule"] == case["before"]["granule"]
        assert client.get(f"/api/v1/curated-cases/{CASE}/export?format=xml").status_code == 422

    for text in texts:  # public responses never reveal server paths
        assert str(settings.resolved_data_dir) not in text and "\\\\" not in text


def test_openapi_has_typed_case_models(settings, database):
    with TestClient(create_app(settings, offline())) as client:
        schemas = client.get("/openapi.json").json()["components"]["schemas"]
    for name in ("CaseSummary", "CaseDetail", "Layer", "FindingCollection", "FindingDetail", "Timeseries", "Sensitivity", "Job",
                 "JobCreated", "Region"):
        assert name in schemas, name


def test_only_published_case_ids_are_visible(tmp_path):
    stage = tmp_path / ".staging-test"
    stage.mkdir()
    (stage / "manifest.json").write_text('{"status":"incomplete"}', encoding="utf-8")
    assert list_cases(tmp_path) == []
    assert read_case(tmp_path, "../.staging-test") is None
    assert read_case(tmp_path, "a" * 24) is None
    published = tmp_path / ("a" * 24)
    published.mkdir()
    manifest = {"id": published.name, "assets": []}
    (published / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert list_cases(tmp_path) == [manifest]
