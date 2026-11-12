"""Small, committable subsets of a case's NISAR GCOV files: exactly what app.processing reads, nothing more.

A full GCOV file is about 6 GB; processing reads one window of it. A subset keeps the original HDF5 paths and dataset
attributes for that window (power terms and mask on one frequency, the window's coordinates, the projection) plus the
identification group and the RTC convention, so app.processing reads it unchanged and gives the same result as the
full file (tests/test_extract.py). The margin is wider than any window processing asks for.

    python -m app.cli extract-case karnaphuli-estuary          # full files in data/raw -> data/extracts/<case>/
    python -m app.cli prepare-case karnaphuli-estuary --from-extracts   # reprocess with no download
"""
import hashlib
import json
from pathlib import Path

import h5py
import numpy as np
import shapely
from pyproj import Transformer

from .processing import DEFAULT_PARAMS
from .processing.gcov import GRIDS, full_grid, window_for_bounds

EXTRACTS_DIR = Path(__file__).resolve().parents[1] / "data" / "extracts"  # committed with the repository
TERMS = ("HHHH", "HVHV")  # HH is what the method uses today; HV is kept so it can be added without a download
IDENTIFICATION = "/science/LSAR/identification"
RTC_CONVENTION = "/science/LSAR/GCOV/metadata/processingInformation/parameters/rtc/outputBackscatterNormalizationConvention"
# processing pads its window by speckle_size//2 + opening_px + 1; keep comfortably more so it is never clamped by the cut
MARGIN_PX = DEFAULT_PARAMS["speckle_size"] // 2 + DEFAULT_PARAMS["opening_px"] + 1 + 16
# dimension-scale bookkeeping refers to objects in the original file and cannot be copied across files
_SKIP_ATTRS = {"DIMENSION_LIST", "REFERENCE_LIST", "CLASS", "NAME", "_Netcdf4Dimid", "_Netcdf4Coordinates"}


def _copy_attrs(src, dst):
    for k, v in src.attrs.items():
        if k not in _SKIP_ATTRS:
            dst.attrs[k] = v


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def subset(src: Path, dst: Path, area, frequency: str = "A", terms=TERMS) -> dict:
    """Write the window of src around area (shapely, EPSG:4326) to dst. Returns where the window sits in src."""
    grid = full_grid(src, frequency)
    to_map = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    area_map = shapely.transform(area, lambda c: np.column_stack(to_map.transform(c[:, 0], c[:, 1])))
    win = window_for_bounds(grid, area_map.bounds, pad=MARGIN_PX)
    if win is None:
        raise ValueError(f"{src.name}: the area does not overlap this acquisition")
    r0, r1, c0, c1 = win
    group = f"{GRIDS}/frequency{frequency}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".tmp")
    with h5py.File(src, "r") as s, h5py.File(tmp, "w") as d:
        _copy_attrs(s, d)
        for path in (IDENTIFICATION, RTC_CONVENTION):
            if path in s:
                parent, name = path.rsplit("/", 1)
                s.copy(s[path], d.require_group(parent), name=name)
        sg, dg = s[group], d.require_group(group)
        _copy_attrs(sg, dg)
        kept = [t for t in terms if t in sg]
        for name in (*kept, "mask"):
            ds = dg.create_dataset(name, data=sg[name][r0:r1, c0:c1], compression="gzip", compression_opts=9, shuffle=True)
            _copy_attrs(sg[name], ds)
        for name, data in (("xCoordinates", sg["xCoordinates"][c0:c1]), ("yCoordinates", sg["yCoordinates"][r0:r1])):
            _copy_attrs(sg[name], dg.create_dataset(name, data=data))
        s.copy(sg["projection"], dg, name="projection")
        d.attrs["cryocore_subset_of"] = src.name
        d.attrs["cryocore_subset_window"] = np.array([r0, r1, c0, c1], np.int64)  # rows, cols in the full grid
    tmp.replace(dst)
    return {"terms": kept, "frequency": frequency, "rows": [r0, r1], "cols": [c0, c1],
            "full_shape": [grid.height, grid.width], "epsg": grid.epsg, "posting_m": list(grid.posting)}


def manifest_path(case_id: str) -> Path:
    return EXTRACTS_DIR / case_id / "extracts.json"


def write_case(case_id: str, area, files: dict[str, Path], sources: list[dict]) -> dict:
    """Subset both files of a case and record provenance. files: {"before", "after"}; sources: [before, after]."""
    out = EXTRACTS_DIR / case_id
    entries = {}
    for key, source in zip(("before", "after"), sources):
        dst = out / f"{source['granule']}.subset.h5"
        window = subset(files[key], dst, area)
        entries[key] = {"file": dst.name, "sha256": sha256(dst), "bytes": dst.stat().st_size, "source": source,
                        "window": window}
    manifest = {"case_id": case_id, "method": "app/extract.py subset: original HDF5 paths, gzip level 9",
                "margin_px": MARGIN_PX, **entries}
    manifest_path(case_id).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return manifest


def case_files(case_id: str) -> tuple[dict[str, Path], list[dict]]:
    """The committed subsets of a case, checked against their recorded SHA-256, and their source records."""
    path = manifest_path(case_id)
    if not path.is_file():
        raise FileNotFoundError(f"No extracts for {case_id}: run 'python -m app.cli extract-case {case_id}' first.")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    files = {}
    for key in ("before", "after"):
        entry = manifest[key]
        file = path.parent / entry["file"]
        if not file.is_file() or sha256(file) != entry["sha256"]:
            raise ValueError(f"{file.name} is missing or does not match its recorded SHA-256")
        files[key] = file
    return files, [manifest["before"]["source"], manifest["after"]["source"]]
