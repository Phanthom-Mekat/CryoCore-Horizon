import sqlite3

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

QUERY = {"start_date": "2026-01-01", "end_date": "2026-01-31", "page_size": 1}


def catalog_response(request):
    if request.url.path.endswith("collections.json"):
        assert request.url.params["short_name"] == "NISAR_L2_GCOV_*"
        return httpx.Response(200, json={"feed": {"entry": [{"id": "C-TEST"}]}})
    assert request.url.params["collection_concept_id[]"] == "C-TEST"
    assert request.url.params["bounding_box"] == "90.5,20.5,92.7,24.3"
    assert request.url.params["temporal"] == "2026-01-01T00:00:00Z,2026-01-31T23:59:59.999Z"
    return httpx.Response(200, json={"hits": 2, "items": [{
        "meta": {"concept-id": "G-TEST", "revision-id": 1},
        "umm": {"GranuleUR": "test-fixture-not-real-data", "CollectionReference": {"ShortName": "NISAR_L2_GCOV_V1"},
                "TemporalExtent": {"RangeDateTime": {"BeginningDateTime": "2026-01-02T00:00:00Z"}},
                "RelatedUrls": [{"URL": "https://example.org/test.h5", "Type": "GET DATA"}],
                "SpatialExtent": {}},
    }]})


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "test.sqlite3", _env_file=None)


def test_discovery_persistence_idempotency_and_restart(settings):
    transport = httpx.MockTransport(catalog_response)
    with TestClient(create_app(settings, transport)) as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/api/v1/region").json()["name"] == "Chattogram Division"
        assert client.get("/api/v1/scenes").json()["total"] == 0
        result = client.post("/api/v1/nasa/search", json=QUERY)
        assert result.status_code == 200, result.text
        assert result.json()["has_more"] is True
        assert result.json()["scenes"][0]["metadata"]["meta"]["revision-id"] == 1
        assert client.post("/api/v1/nasa/search", json=QUERY).status_code == 200
        assert client.get("/api/v1/scenes").json()["total"] == 1
        assert client.get("/api/v1/scenes?product=GOFF").json()["total"] == 0
        assert client.get("/api/v1/scenes?offset=1").json()["scenes"] == []
    with TestClient(create_app(settings, transport)) as client:
        assert client.get("/api/v1/scenes/G-TEST").status_code == 200
        assert client.get("/api/v1/scenes/unknown").status_code == 404
    with sqlite3.connect(settings.resolved_database_path) as db:
        assert db.execute("SELECT COUNT(*) FROM searches").fetchone()[0] == 2


@pytest.mark.parametrize("update", [
    {"end_date": "2025-01-01"}, {"start_date": "not-a-date"},
    {"product": "FAKE"}, {"page_size": 101}, {"page": 0}, {"region": "greenland"},
])
def test_invalid_requests_do_not_reach_nasa(settings, update):
    def no_network(request):
        pytest.fail("Invalid request reached NASA")
    with TestClient(create_app(settings, httpx.MockTransport(no_network))) as client:
        assert client.post("/api/v1/nasa/search", json=QUERY | update).status_code == 422


@pytest.mark.parametrize("mode", ["timeout", "http", "malformed"])
def test_upstream_failures_do_not_persist(settings, mode):
    def broken(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(503 if mode == "http" else 200, json={})
    with TestClient(create_app(settings, httpx.MockTransport(broken))) as client:
        assert client.post("/api/v1/nasa/search", json=QUERY).status_code == 502
        assert client.get("/api/v1/scenes").json()["total"] == 0
    with sqlite3.connect(settings.resolved_database_path) as db:
        assert db.execute("SELECT COUNT(*) FROM searches").fetchone()[0] == 0


def test_empty_coverage_is_not_fake_data(settings):
    def empty(request):
        if request.url.path.endswith("collections.json"):
            return catalog_response(request)
        return httpx.Response(200, json={"hits": 0, "items": []})
    with TestClient(create_app(settings, httpx.MockTransport(empty))) as client:
        response = client.post("/api/v1/nasa/search", json=QUERY)
        assert response.status_code == 200
        assert response.json()["scenes"] == []
        assert response.json()["has_more"] is False


def test_cors_and_docs(settings):
    with TestClient(create_app(settings)) as client:
        response = client.options("/api/v1/nasa/search", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
        })
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert client.get("/openapi.json").status_code == 200
