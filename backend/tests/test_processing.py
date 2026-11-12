import json

import numpy as np
import pytest
from PIL import Image
from shapely.geometry import box, shape

from app.processing import GcovError, NoValidCoverage, process_pair
from app.processing.change import to_db
from app.processing.gcov import full_grid, read
from app.processing.grid import pixel_area_km2
from fixtures.synthetic_gcov import make_gcov

AREA = box(91.80, 22.275, 91.84, 22.305)
INCREASE = (91.81, 22.295, 300, 8.0)  # lon, lat, half side (m), dB
DECREASE = (91.83, 22.283, 200, -8.0)
BLOCKED = (91.825, 22.300, 150)  # mask 0 in the after file, with a planted change underneath
SOURCES = [{"granule": "SYNTHETIC_BEFORE", "collection": "NISAR_L2_GCOV_BETA_V1"},
           {"granule": "SYNTHETIC_AFTER", "collection": "NISAR_L2_GCOV_BETA_V1"}]


@pytest.fixture
def pair(tmp_path):
    before = make_gcov(tmp_path / "before.h5", seed=1)
    after = make_gcov(tmp_path / "after.h5", seed=2, start="2026-02-03T23:41:09.000000000",
                      plants=[INCREASE, DECREASE, (*BLOCKED, 8.0)], invalid_boxes=[BLOCKED])
    return before, after


def run(before, after, out, **params):
    return process_pair(before, after, AREA, out, SOURCES, params or None)


def near(feature, lon, lat, tol=0.003):
    c = shape(feature["geometry"]).centroid
    return abs(c.x - lon) < tol and abs(c.y - lat) < tol


def test_db_conversion():
    out = to_db(np.array([1.0, 0.1, 0.01, 0.0, -1.0, np.nan]))
    assert np.allclose(out[:3], [0, -10, -20])
    assert np.isnan(out[3:]).all()


def test_windowed_read_preserves_mask_and_nodata(pair):
    before, after = pair
    g = full_grid(after, "A")
    assert (g.epsg, g.posting, g.width, g.height) == (32646, (20.0, 20.0), 300, 300)
    power, mask = read(after, "A", "HHHH", (0, 300), (0, 40))  # includes the 255 edge columns
    assert power.shape == (300, 40)
    assert (mask[:, :10] == 255).all() and np.isnan(power[:, :10]).all()
    power, mask = read(after, "A", "HHHH", (-5, 20), (290, 310))  # past the raster: filled, not wrapped
    assert (mask[:5] == 255).all() and (mask[:, 10:] == 255).all() and np.isnan(power[:, 10:]).all()
    full, fmask = read(after, "A", "HHHH", (0, 300), (0, 300))
    assert (fmask == 0).any() and np.isnan(full[fmask == 0]).all()
    assert (full[np.isfinite(full)] > 0).all()


def test_planted_change_found_and_masked_change_suppressed(pair, tmp_path):
    result = run(*pair, tmp_path / "out")
    fc = json.loads((tmp_path / "out" / "findings.geojson").read_text(encoding="utf-8"))
    feats = fc["features"]
    assert result["findings_count"] == len(feats) >= 2
    inc = [f for f in feats if f["properties"]["kind"] == "increase" and near(f, *INCREASE[:2])]
    dec = [f for f in feats if f["properties"]["kind"] == "decrease" and near(f, *DECREASE[:2])]
    assert len(inc) == 1 and len(dec) == 1
    pi, pd = inc[0]["properties"], dec[0]["properties"]
    assert pi["label"] == pd["label"] == "Observed radar change"
    assert 0.3 < pi["area_km2"] < 0.5 and 0.12 < pd["area_km2"] < 0.25
    assert 6 < pi["mean_delta_db"] < 9 and -9 < pd["mean_delta_db"] < -6
    assert pi["median_after_db"] - pi["median_before_db"] > 6
    assert pi["quality"] == "strong" and pi["quality_reason"].startswith("Strong")
    assert not any(near(f, *BLOCKED[:2], tol=0.0015) for f in feats), "change under mask 0 must not be reported"
    assert all(f["properties"]["quality"] in {"strong", "moderate", "weak"} for f in feats)
    assert not any(w in json.dumps(fc).lower() for w in ("flood", "water", "damage"))
    m = result["metrics"]
    assert m["increase_km2"] == pytest.approx(sum(f["properties"]["area_km2"] for f in feats
                                                  if f["properties"]["kind"] == "increase"), abs=1e-3)
    assert m["threshold_db"] == 3.0


def test_area_math(pair, tmp_path):
    before, _ = pair
    km2 = pixel_area_km2(full_grid(before, "A"))
    assert 0.0004 < km2 < 0.0004 * 1.001  # UTM scale < 1 west of the central meridian 93E: ground > map area
    m = run(*pair, tmp_path / "out")["metrics"]
    approx = 0.04 * 111.32 * np.cos(np.radians(22.29)) * 0.03 * 110.75
    assert m["analysis_km2"] == pytest.approx(approx, rel=0.01)
    assert m["valid_common_km2"] + m["excluded_km2"] == pytest.approx(m["analysis_km2"], abs=1e-3)
    blocked_km2 = (2 * BLOCKED[2] / 1000) ** 2
    assert m["excluded_km2"] == pytest.approx(blocked_km2, rel=0.25)


def test_grid_mismatch_is_resampled(tmp_path):
    before = make_gcov(tmp_path / "b.h5", seed=1)
    after = make_gcov(tmp_path / "a.h5", seed=2, shift=(7.0, -3.0), plants=[INCREASE])
    result = run(before, after, tmp_path / "out")
    assert result["method"]["params"]["grid_alignment"].startswith("resampled")
    assert any("resampled" in c for c in result["caveats"])
    feats = json.loads((tmp_path / "out" / "findings.geojson").read_text(encoding="utf-8"))["features"]
    assert any(f["properties"]["kind"] == "increase" and near(f, *INCREASE[:2]) for f in feats)
    aligned = run(before, make_gcov(tmp_path / "a2.h5", seed=2), tmp_path / "out2")
    assert aligned["method"]["params"]["grid_alignment"].startswith("exact")
    assert aligned["findings_count"] == 0 and aligned["metrics"]["increase_km2"] == 0  # speckle alone: no findings


def test_zero_valid_coverage_raises(pair, tmp_path):
    with pytest.raises(NoValidCoverage, match="does not overlap"):
        process_pair(*pair, box(92.5, 22.2, 92.6, 22.3), tmp_path / "o1", SOURCES)
    lon, lat, _ = BLOCKED
    with pytest.raises(NoValidCoverage, match="valid on both dates"):
        process_pair(*pair, box(lon - 0.0005, lat - 0.0005, lon + 0.0005, lat + 0.0005), tmp_path / "o2", SOURCES)


def test_missing_layers_raise(pair, tmp_path):
    with pytest.raises(GcovError, match="VVVV"):
        run(*pair, tmp_path / "o1", polarization="VVVV")
    no_mask = make_gcov(tmp_path / "nomask.h5", mask=False)
    with pytest.raises(GcovError, match="mask"):
        run(pair[0], no_mask, tmp_path / "o2")
    with pytest.raises(ValueError, match="unknown"):
        run(*pair, tmp_path / "o3", thresh=2)


def test_repeatable(pair, tmp_path):
    r1, r2 = run(*pair, tmp_path / "a"), run(*pair, tmp_path / "b")
    assert r1 == r2
    for name in ("before_db.png", "after_db.png", "change_db.png", "findings.geojson", "timeseries.json"):
        assert (tmp_path / "a" / name).read_bytes() == (tmp_path / "b" / name).read_bytes(), name


def test_pngs_corners_alpha_and_palette(pair, tmp_path):
    result = run(*pair, tmp_path / "out")
    layers = {l["id"]: l for l in result["layers"]}
    assert set(layers) == {"before_db", "after_db", "change_db"}
    (tl, tr, br, bl) = layers["change_db"]["corners"]
    assert tl[1] == tr[1] > br[1] == bl[1] and tl[0] == bl[0] < tr[0] == br[0]  # north-up lon/lat
    assert tl[0] <= 91.80 and tr[0] >= 91.84 and bl[1] <= 22.275 and tl[1] >= 22.305
    assert layers["before_db"]["scale"] == layers["after_db"]["scale"] == {"min": -25.0, "max": 0.0}
    assert layers["change_db"]["palette"] == "diverging" and layers["change_db"]["scale"] == {"min": -6.0, "max": 6.0}
    imgs = {k: Image.open(tmp_path / "out" / v["file"]) for k, v in layers.items()}
    assert len({im.size for im in imgs.values()}) == 1 and all(im.mode == "RGBA" for im in imgs.values())
    w, h = imgs["change_db"].size
    assert max(w, h) <= 2000

    def px(img, lon, lat):
        return img.getpixel((int((lon - tl[0]) / (tr[0] - tl[0]) * w), int((tl[1] - lat) / (tl[1] - bl[1]) * h)))

    assert imgs["change_db"].getpixel((0, 0))[3] == 0  # padding outside the polygon is transparent
    assert px(imgs["change_db"], *INCREASE[:2]) == (0x4F, 0x9A, 0x4A, 255)  # +8 dB clamps to palette.ts pos
    assert px(imgs["change_db"], *DECREASE[:2]) == (0xC2, 0x50, 0x9A, 255)
    assert px(imgs["change_db"], *BLOCKED[:2])[3] == 0  # masked on the after date
    assert px(imgs["before_db"], *BLOCKED[:2])[3] == 255  # but valid before
    arr = np.asarray(imgs["before_db"])
    gray = np.median(arr[..., 0][arr[..., 3] == 255])
    assert abs(gray - 13 / 25 * 255) < 3  # the -12 dB background on the shared -25..0 scale
