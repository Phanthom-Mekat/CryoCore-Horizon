import json
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.warp import transform
from app.areas import area_evidence

ROOT = Path(__file__).parents[1] / "data/cases/6573c8bc5837ede3c0541563"
MANIFEST = json.loads((ROOT / "manifest.json").read_text())


def point(row, col):
    with rasterio.open(ROOT / "before-HHHH.tif") as src:
        x,y=src.xy(row,col)
        lon,lat=transform(src.crs,"EPSG:4326",[x],[y])
        return lon[0],lat[0]


def test_full_area_reconciles_with_published_pilot():
    first,last=point(0,0),point(255,255)
    report=area_evidence(ROOT,MANIFEST,*first,*last)
    assert report["selected_pixels"] == 65536
    assert report["selected_area_km2"] == pytest.approx(26.2144)
    for row,pol in zip(report["measurements"],("HHHH","HVHV")):
        assert row["valid_pixels"] == MANIFEST["statistics"][pol]["common_valid_pixels"]
        assert row["change_median_db"] == pytest.approx(MANIFEST["statistics"][pol]["median_change_db"])
        assert sum(row["histogram_counts"]) == row["valid_pixels"]
        assert row["valid_pixels"] + row["excluded_pixels"] == report["selected_pixels"]
    reverse=area_evidence(ROOT,MANIFEST,*last,*first)
    assert reverse["measurements"] == report["measurements"]


def test_excluded_and_outside_are_not_zero_change():
    with rasterio.open(ROOT / "common-HHHH.tif") as src:
        r,c=np.argwhere(src.read(1)==0)[0]
    p=point(int(r),int(c))
    report=area_evidence(ROOT,MANIFEST,*p,*p)
    assert report["status"] == "excluded"
    assert report["measurements"][0]["change_median_db"] is None
    json.dumps(report,allow_nan=False)
    assert area_evidence(ROOT,MANIFEST,91,22,91.01,22.01)["status"] == "outside_extent"
