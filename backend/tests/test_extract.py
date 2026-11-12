import json

import h5py
import pytest

from app import extract
from app.processing import process_pair
from fixtures.synthetic_gcov import make_gcov
from test_processing import AREA, DECREASE, INCREASE, SOURCES


def test_subset_processes_exactly_like_the_full_file(tmp_path):
    full = {"before": make_gcov(tmp_path / "before.h5", seed=1),
            "after": make_gcov(tmp_path / "after.h5", seed=2, start="2026-02-03T23:41:09.000000000",
                               plants=[INCREASE, DECREASE])}
    cut = {k: tmp_path / f"{k}.subset.h5" for k in full}
    windows = {k: extract.subset(full[k], cut[k], AREA) for k in full}

    w = windows["before"]
    assert w["rows"][1] - w["rows"][0] < w["full_shape"][0] and w["cols"][1] - w["cols"][0] < w["full_shape"][1]
    with h5py.File(cut["before"]) as h5:  # same paths, only the window, provenance recorded
        assert h5[f"{extract.GRIDS}/frequencyA/HHHH"].shape == (w["rows"][1] - w["rows"][0], w["cols"][1] - w["cols"][0])
        assert h5.attrs["cryocore_subset_of"] == "before.h5"

    a = process_pair(full["before"], full["after"], AREA, tmp_path / "full", SOURCES)
    b = process_pair(cut["before"], cut["after"], AREA, tmp_path / "cut", SOURCES)
    assert a["metrics"] == b["metrics"] and a["metrics"]["increase_km2"] > 0
    for name in ("findings.geojson", "timeseries.json", "before_db.png", "after_db.png", "change_db.png"):
        assert (tmp_path / "full" / name).read_bytes() == (tmp_path / "cut" / name).read_bytes(), name


def test_case_files_refuse_a_changed_subset(tmp_path, monkeypatch):
    monkeypatch.setattr(extract, "EXTRACTS_DIR", tmp_path)
    files = {"before": make_gcov(tmp_path / "b.h5", seed=1), "after": make_gcov(tmp_path / "a.h5", seed=2)}
    sources = [{"granule": "SYN_B", "concept_id": "C1"}, {"granule": "SYN_A", "concept_id": "C2"}]
    manifest = extract.write_case("case", AREA, files, sources)
    got, got_sources = extract.case_files("case")
    assert got_sources == sources and got["before"].name == manifest["before"]["file"]

    with open(got["after"], "ab") as f:
        f.write(b"tampered")
    with pytest.raises(ValueError, match="SHA-256"):
        extract.case_files("case")
    assert json.loads(extract.manifest_path("case").read_text())["margin_px"] == extract.MARGIN_PX
