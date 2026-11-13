import csv
import io
import json
from pathlib import Path

from fastapi.testclient import TestClient
from app.brief import processed_brief, brief_csv
from app.config import Settings
from app.main import create_app


CASE = "6573c8bc5837ede3c0541563"
MANIFEST = Path(__file__).parents[1] / "data" / "cases" / CASE / "manifest.json"


def test_brief_matches_published_measurements_and_provenance():
    manifest = json.loads(MANIFEST.read_text())
    report = processed_brief(manifest)
    for row, pol in zip(report["measurements"], ("HHHH", "HVHV")):
        s = manifest["statistics"][pol]
        assert row["median_change_db"] == s["median_change_db"]
        assert row["p05_change_db"] == s["change_percentiles_db"][0]
        assert row["p95_change_db"] == s["change_percentiles_db"][2]
        assert row["common_area_km2"] == s["common_area_km2"]
        assert row["geographic_exclusion_km2"] == s["outside_roi_area_km2"]
    assert report["sources"] == manifest["sources"]
    assert report["assets"] == manifest["assets"]
    assert report["limitations"] == manifest["limitations"]
    assert "not a confidence interval" in report["distribution_note"]


def test_csv_preserves_precision_and_caveats():
    report = processed_brief(json.loads(MANIFEST.read_text()))
    rows = list(csv.DictReader(io.StringIO(brief_csv(report))))
    assert len(rows) == 2
    for actual, expected in zip(rows, report["measurements"]):
        assert float(actual["median_change_db"]) == expected["median_change_db"]
        assert actual["before_concept_id"] == report["sources"][0]["concept_id"]
        assert actual["after_concept_id"] == report["sources"][1]["concept_id"]
        assert report["limitations"][-1] in actual["limitations"]


def test_brief_api_formats_and_unknown_case(tmp_path):
    with TestClient(create_app(Settings(database_path=str(tmp_path / "test.sqlite")))) as client:
        report = client.get(f"/api/v1/cases/{CASE}/brief")
        assert report.status_code == 200
        assert report.json()["case_id"] == CASE
        csv_response = client.get(f"/api/v1/cases/{CASE}/brief?format=csv")
        assert csv_response.status_code == 200
        assert "attachment" in csv_response.headers["content-disposition"]
        assert len(list(csv.DictReader(io.StringIO(csv_response.text)))) == 2
        assert client.get(f"/api/v1/cases/{CASE}/brief?format=html").status_code == 422
        assert client.get('/api/v1/cases/' + '0' * 24 + '/brief').status_code == 404


def test_pilot_window_outline_is_a_closed_wgs84_polygon_over_chattogram():
    from shapely.geometry import Point, shape
    from app.cases import read_case
    manifest = read_case(MANIFEST.parents[1], CASE)
    outline = shape(manifest["footprint_wgs84"])
    assert outline.is_valid and len(manifest["footprint_wgs84"]["coordinates"][0]) == 33
    assert outline.bounds[0] > 91 and outline.bounds[2] < 93 and outline.bounds[1] > 21 and outline.bounds[3] < 23.5
    # about 256 x 256 px at 20 m: ~5.1 km on a side, ~0.05 degrees
    assert 0.04 < outline.bounds[2] - outline.bounds[0] < 0.06 and 0.04 < outline.bounds[3] - outline.bounds[1] < 0.06
    assert outline.contains(Point(outline.centroid))
