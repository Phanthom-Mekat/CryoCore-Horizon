import numpy as np
import pytest

from app.processing import change, plain


@pytest.mark.parametrize("kind,values,expected", [
    ("increase", (-9.6, -4.9, -21.0, -16.0), "plants_grew"),  # flooded paddy in June, rice grown by October
    ("increase", (-5.0, 4.0, -14.0, -13.0), "object"),  # a ship or new roof: very bright HH after
    ("increase", (-12.0, -8.0, -20.0, -18.9), "water_went"),  # water-like before only, HV barely rose
    ("increase", (-8.0, -4.0, -15.0, -14.5), "surface"),  # HH up alone: wetter or rougher ground
    ("decrease", (-7.0, -12.0, -16.0, -21.0), "water_came"),
    ("decrease", (6.0, -3.0, -8.0, -9.0), "object"),  # a bright echo went away (a ship left)
    ("decrease", (-6.0, -10.0, -12.0, -15.0), "plants_lost"),
    ("decrease", (-6.0, -10.0, -12.0, -12.5), "surface"),
])
def test_region_rules(kind, values, expected):
    assert plain.read_region(kind, *values) == expected


def test_regions_are_painted_whole_and_water_fills_the_rest():
    shape = (60, 60)
    hh_b, hh_a = np.full(shape, -8.0, np.float32), np.full(shape, -8.0, np.float32)
    hv_b, hv_a = np.full(shape, -15.0, np.float32), np.full(shape, -15.0, np.float32)
    hh_a[5:25, 5:25] = -3.0  # +5 dB HH
    hv_a[5:25, 5:25] = -12.0  # +3 dB HV: plants grew
    hv_a[10, 10] = -20.0  # one noisy pixel inside it does not change the region's reading
    hv_b[40:60, 30:60] = hv_a[40:60, 30:60] = -22.0  # the river, no change
    hv_b[0, 59] = hv_a[0, 59] = -22.0  # a single dark speckle pixel is not water
    common = np.ones(shape, bool)
    common[50:60, 50:60] = False  # unobserved corner of the river
    regions = {kind: change.regions(np.where(common, hh_a - hh_b, np.nan), sign, 3.0, 3, 50) for kind, sign in change.SIGNS}
    codes, read = plain.classify(regions, hh_b, hh_a, hv_b, hv_a, common, 3, 50)
    assert read == {"increase": ["plants_grew"], "decrease": []}
    assert (codes[5:25, 5:25] == plain.CODE["plants_grew"]).all()
    assert (codes[40:50, 30:60] == plain.CODE["water"]).all() and (codes[50:60, 50:60] == 0).all()
    assert codes[0, 59] == 0 and codes[30, 5] == 0


def test_summary_and_colours():
    codes = np.zeros((10, 10), np.uint8)
    codes[:4] = plain.CODE["plants_grew"]
    codes[4:5] = plain.CODE["water"]
    rows = {r["id"]: r for r in plain.summary(codes, 0.5)}
    assert rows["plants_grew"]["area_km2"] == 20.0 and rows["water"]["area_km2"] == 5.0 and rows["object"]["area_km2"] == 0
    assert rows["plants_grew"]["color"] == "#199e70"
    rgba = plain.rgba(np.array([[np.nan, plain.CODE["plants_grew"]]], np.float32))
    assert rgba[0, 0, 3] == 0 and tuple(rgba[0, 1]) == (0x19, 0x9E, 0x70, 235)
