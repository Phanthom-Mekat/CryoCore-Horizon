import hashlib
import json

from fastapi.testclient import TestClient
from shapely.geometry import Point

from app.config import Settings
from app.explorer import ASSETS, boundary, build_explorer, footprint
from app.main import create_app


def rectangle(w, s, e, n):
    return {"HorizontalSpatialDomain": {"Geometry": {"BoundingRectangles": [{
        "WestBoundingCoordinate": w, "SouthBoundingCoordinate": s,
        "EastBoundingCoordinate": e, "NorthBoundingCoordinate": n,
    }]}}}


def row(identifier, extent):
    return {"payload": json.dumps({
        "concept_id": identifier, "granule_id": "fixture", "product": "GCOV", "start_time": "2026-01-02T00:00:00Z",
        "end_time": None, "revision_id": 1, "retrieved_at": "2026-02-01T00:00:00Z", "spatial_extent": extent,
        "metadata": {"umm": {"AdditionalAttributes": [{"Name": "TRACK_NUMBER", "Values": ["123"]}]}},
    })}


def test_boundary_source_integrity_and_location():
    polygon, display, source = boundary()
    assert polygon.is_valid
    assert polygon.contains(Point(91.7832, 22.3569))  # Chattogram city
    assert not polygon.contains(Point(90.4125, 23.8103))  # Dhaka
    assert hashlib.sha256((ASSETS / "chattogram.geojson").read_bytes()).hexdigest() == source["sha256"]
    assert source["year"] == 2018
    assert display["features"][0]["properties"]["shapeName"] == "Chittagong"


def test_footprints_are_filtered_and_missing_is_counted():
    data = build_explorer([
        row("inside", rectangle(91.7, 22.3, 91.9, 22.5)),
        row("outside", rectangle(87.9, 21, 88.1, 21.2)), row("missing", {}),
    ])
    assert data["summary"]["intersecting_records"] == 1
    assert data["summary"]["outside_division"] == 1
    assert data["summary"]["missing_geometry"] == 1
    assert data["timeline"] == [{"date": "2026-01-02", "count": 1}]
    assert data["scenes"]["features"][0]["properties"]["track"] == "123"


def test_polygon_holes_and_closed_rings():
    def points(coords):
        return [{"Longitude": x, "Latitude": y} for x, y in coords]
    extent = {"HorizontalSpatialDomain": {"Geometry": {"GPolygons": [{
        "Boundary": {"Points": points([(90, 20), (93, 20), (93, 24), (90, 24)])},
        "ExclusiveZone": {"Boundaries": [{"Points": points([(91, 21), (92, 21), (92, 22), (91, 22)])}]},
    }]}}}
    polygon = footprint(extent)
    assert polygon is not None and polygon.is_valid
    assert not polygon.contains(Point(91.5, 21.5))
    assert polygon.contains(Point(90.5, 20.5))


def test_invalid_coordinates_and_antimeridian_do_not_invent_geometry():
    assert footprint(rectangle(180, 20, -180, 21)) is None
    assert footprint(rectangle(90, 100, 91, 101)) is None
    assert footprint(rectangle(90, 20, float("inf"), 21)) is None


def test_explorer_empty_response_date_validation_and_product(tmp_path):
    with TestClient(create_app(Settings(database_path=tmp_path / "test.db", _env_file=None))) as client:
        result = client.get("/api/v1/explorer")
        assert result.status_code == 200
        assert result.json()["summary"]["stored_records"] == 0
        assert result.json()["scenes"]["features"] == []
        assert client.get("/api/v1/explorer?start_date=2026-02-01&end_date=2026-01-01").status_code == 422
        assert client.get("/api/v1/explorer?product=UNKNOWN").status_code == 422
