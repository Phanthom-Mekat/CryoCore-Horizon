import json
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform
from fastapi.testclient import TestClient

from app.sampling import sample_case
from app.config import Settings
import app.main as main


@pytest.fixture
def bundle(tmp_path):
    case_id = "a" * 24
    root = tmp_path / "data" / "cases" / case_id
    root.mkdir(parents=True)
    affine = from_origin(378480, 2472380, 20, 20)
    manifest = {"id": case_id, "method": "test", "claim": "Observed change only", "assets": [],
                "sources": [{"concept_id": "before", "revision_id": 1, "acquisition": "2026-07-07"},
                            {"concept_id": "after", "revision_id": 1, "acquisition": "2026-10-11"}]}
    for pol in ("HHHH", "HVHV"):
        for kind, value in (("before", -20), ("after", -12), ("change", 8), ("common", 1)):
            name = f"{kind}-{pol}.tif"
            data = np.full((2,2), value, dtype="float32")
            data[0,1] = 0 if kind == "common" else np.nan
            with rasterio.open(root / name, "w", driver="GTiff", width=2,height=2,count=1,dtype="float32",crs="EPSG:32646",transform=affine,nodata=np.nan) as dst:
                dst.write(data,1)
            manifest["assets"].append({"name": name, "sha256": kind + pol})
    (root / "manifest.json").write_text(json.dumps(manifest),encoding="utf-8")
    return root, manifest


def coordinate(x,y):
    longitude,latitude = transform("EPSG:32646","EPSG:4326",[x],[y])
    return longitude[0], latitude[0]


def test_native_measurement_not_clipped_to_legend(bundle):
    root,manifest = bundle
    result = sample_case(root,manifest,*coordinate(378490,2472370))
    assert result["status"] == "valid"
    assert result["pixel"]["row"] == result["pixel"]["column"] == 0
    assert result["polarizations"]["HHHH"]["change_db"] == 8
    assert result["polarizations"]["HVHV"]["before_db"] == -20
    assert result["sources"][0]["concept_id"] == "before"
    json.dumps(result,allow_nan=False)


def test_excluded_is_null_not_zero(bundle):
    root,manifest = bundle
    result = sample_case(root,manifest,*coordinate(378510,2472370))
    assert result["status"] == "excluded"
    assert result["polarizations"]["HHHH"]["change_db"] is None
    assert result["polarizations"]["HHHH"]["before_db"] is None
    json.dumps(result,allow_nan=False)


def test_outside_never_wraps_to_a_pixel(bundle):
    root,manifest = bundle
    for x,y in ((378470,2472370),(378530,2472370),(378490,2472390),(378490,2472330)):
        result = sample_case(root,manifest,*coordinate(x,y))
        assert result["status"] == "outside_extent" and result["pixel"] is None


@pytest.mark.parametrize("lon,lat", [(float("nan"),22),(91,float("inf")),(181,22),(91,-91)])
def test_invalid_coordinates_rejected(bundle,lon,lat):
    with pytest.raises(ValueError): sample_case(*bundle,lon,lat)


def test_api_contract_and_missing_case(bundle,tmp_path,monkeypatch):
    monkeypatch.setattr(main,"BACKEND_ROOT",tmp_path)
    settings = Settings(database_path=tmp_path / "test.sqlite", _env_file=None)
    with TestClient(main.create_app(settings)) as client:
        lon,lat = coordinate(378490,2472370)
        route = f"/api/v1/cases/{bundle[1]['id']}/sample"
        response = client.get(route,params={"longitude":lon,"latitude":lat})
        assert response.status_code == 200 and response.json()["status"] == "valid"
        assert client.get(route,params={"longitude":"nan","latitude":22}).status_code == 422
        assert client.get("/api/v1/cases/unknown/sample",params={"longitude":91,"latitude":22}).status_code == 404


def test_zero_is_a_valid_measurement(bundle):
    root,manifest = bundle
    for pol in ("HHHH","HVHV"):
        with rasterio.open(root / f"change-{pol}.tif","r+") as dst:
            data = dst.read(1); data[0,0] = 0; dst.write(data,1)
    result = sample_case(root,manifest,*coordinate(378490,2472370))
    assert result["status"] == "valid"
    assert result["polarizations"]["HHHH"]["change_db"] == 0


def test_grid_mismatch_is_not_silently_sampled(bundle):
    root,manifest = bundle
    with rasterio.open(root / "after-HHHH.tif","r+") as dst:
        dst.transform = from_origin(378500,2472380,20,20)
    with pytest.raises(ValueError,match="grids"):
        sample_case(root,manifest,*coordinate(378490,2472370))
