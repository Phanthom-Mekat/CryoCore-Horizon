"""Windowed reader for NISAR L2 GCOV (geocoded polarimetric covariance) HDF5 files.

Layout verified on 12 Nov 2026 against:
- ASF NISAR GCOV guide: https://nisar-docs.asf.alaska.edu/gcov/
- JPL D-102274 Rev F, NASA SDS Product Specification L2 GCOV, v1.5.0 (8 Jul 2026), Sec. 3.6, 3.7, 4.3.3, Table 5-3:
  https://cumulus.asf.earthdatacloud.nasa.gov/PUBLIC/DATA/NISAR/NISAR_D-102274_RevF_NASA_SDS_Product_Specification_L2_GCOV_w-esigs.pdf

Facts this module relies on (paths under /science/LSAR/GCOV/grids/frequency{A,B}/):
- HHHH, HVHV, VVVV, VHVH (RHRH, RVRV for compact pol): diagonal covariance terms, Float32, linear power (units "1"),
  RTC-normalised from beta0 to gamma0 (area-based), _FillValue NaN, valid_min 0. Off-diagonal terms (HHHV, ...) are
  CFloat32 and are not backscatter power, so they are refused. Attributes isReceiveOnlyChannel1/2 == "True" mark a
  term recorded with transmit disabled (noise only); such a term is refused.
- mask: UByte. 0 = invalid or partially focused, 1..5 = valid (sub-swath number), 255 = fill (outside the RSLC).
- xCoordinates (width) / yCoordinates (length): Float64 metres, pixel_coordinate_convention "center"; the grid is
  north-up, x increasing along columns, y decreasing along rows.
- projection: UInt32 scalar whose value (and attribute epsg_code) is the EPSG code; UTM for Chattogram (EPSG:32646).
- Posting: 10 m or 20 m for frequency A, 80 m for frequency B.
- /science/LSAR/identification/zeroDopplerStartTime: "YYYY-mm-ddTHH:MM:SS.sssssssss" UTC.
- .../metadata/processingInformation/parameters/rtc/outputBackscatterNormalizationConvention: e.g. "gamma0".
"""

from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np
from rasterio.transform import Affine

GRIDS = "/science/LSAR/GCOV/grids"
# Real-valued power terms, in the order we prefer them when the caller does not choose.
DIAGONAL_TERMS = ("HHHH", "VVVV", "HVHV", "VHVH", "RHRH", "RVRV")
VALID_MASK_MIN, VALID_MASK_MAX, MASK_FILL = 1, 5, 255


class GcovError(ValueError):
    """The file cannot provide what the method needs; the message says what is missing."""


@dataclass(frozen=True)
class Grid:
    epsg: int
    transform: Affine  # top-left corner of the top-left pixel
    width: int
    height: int

    @property
    def crs(self) -> str:
        return f"EPSG:{self.epsg}"

    @property
    def posting(self) -> tuple[float, float]:
        return self.transform.a, -self.transform.e

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        left, top = self.transform.c, self.transform.f
        return left, top + self.transform.e * self.height, left + self.transform.a * self.width, top

    def window_grid(self, row0: int, col0: int, height: int, width: int) -> "Grid":
        return Grid(self.epsg, self.transform @ Affine.translation(col0, row0), width, height)


def _text(value) -> str:
    if isinstance(value, np.ndarray):
        value = value.item() if value.shape == () else value[0]
    return value.decode() if isinstance(value, bytes) else str(value)


def _group(h5: h5py.File, frequency: str, path: Path) -> h5py.Group:
    name = f"{GRIDS}/frequency{frequency}"
    if name not in h5:
        raise GcovError(f"{path.name}: no {name} group (not a GCOV product, or frequency {frequency} absent)")
    return h5[name]


def _dataset(group: h5py.Group, name: str, path: Path) -> h5py.Dataset:
    if name not in group:
        raise GcovError(f"{path.name}: required layer {group.name}/{name} is missing")
    return group[name]


def power_terms(path: Path) -> dict[str, list[str]]:
    """Real-valued power terms present, per frequency letter."""
    with h5py.File(path, "r") as h5:
        if GRIDS not in h5:
            raise GcovError(f"{path.name}: no {GRIDS} group; not a NISAR GCOV product")
        out = {}
        for key in sorted(h5[GRIDS]):
            if key.startswith("frequency"):
                g = h5[GRIDS][key]
                out[key.removeprefix("frequency")] = [
                    t for t in DIAGONAL_TERMS if t in g and isinstance(g[t], h5py.Dataset) and g[t].dtype.kind == "f"
                ]
        return out


def metadata(path: Path) -> dict:
    with h5py.File(path, "r") as h5:
        start = h5.get("/science/LSAR/identification/zeroDopplerStartTime")
        conv = h5.get("/science/LSAR/GCOV/metadata/processingInformation/parameters/rtc/"
                      "outputBackscatterNormalizationConvention")
        return {
            "start_time": _text(start[()]) if start is not None else None,
            "normalization": _text(conv[()]) if conv is not None else None,
            # set only by tests/fixtures/synthetic_gcov.py; real NISAR files never carry it
            "synthetic_fixture": bool(h5.attrs.get("synthetic_fixture", False)),
        }


def full_grid(path: Path, frequency: str) -> Grid:
    with h5py.File(path, "r") as h5:
        g = _group(h5, frequency, path)
        x = _dataset(g, "xCoordinates", path)[()]
        y = _dataset(g, "yCoordinates", path)[()]
        proj = _dataset(g, "projection", path)
        epsg = int(proj.attrs.get("epsg_code", proj[()]))
    if x.size < 2 or y.size < 2:
        raise GcovError(f"{path.name}: coordinate arrays too short")
    dx, dy = (x[-1] - x[0]) / (x.size - 1), (y[0] - y[-1]) / (y.size - 1)
    if dx <= 0 or dy <= 0 or not (np.allclose(np.diff(x), dx, rtol=1e-6) and np.allclose(-np.diff(y), dy, rtol=1e-6)):
        raise GcovError(f"{path.name}: coordinates are not a uniform north-up grid")
    # Coordinates are pixel centres; the affine transform needs the outer corner.
    return Grid(epsg, Affine(dx, 0, x[0] - dx / 2, 0, -dy, y[0] + dy / 2), x.size, y.size)


def window_for_bounds(grid: Grid, bounds, pad: int = 0) -> tuple[int, int, int, int] | None:
    """(row0, row1, col0, col1) covering map-coordinate bounds, padded and clamped; None when they miss the raster."""
    minx, miny, maxx, maxy = bounds
    (dx, dy), (left, _, _, top) = grid.posting, grid.bounds
    c0 = max(int(np.floor((minx - left) / dx)) - pad, 0)
    c1 = min(int(np.ceil((maxx - left) / dx)) + pad, grid.width)
    r0 = max(int(np.floor((top - maxy) / dy)) - pad, 0)
    r1 = min(int(np.ceil((top - miny) / dy)) + pad, grid.height)
    return (r0, r1, c0, c1) if r1 > r0 and c1 > c0 else None


def read(path: Path, frequency: str, term: str, rows: tuple[int, int], cols: tuple[int, int]):
    """Read power and mask for a pixel window, which may extend past the raster (filled with NaN / 255).

    Returns (power, mask): power is float32 linear gamma0 with NaN wherever the pixel is not valid
    (mask not 1..5, non-finite, or <= 0); mask is the stored uint8 mask.
    """
    (r0, r1), (c0, c1) = rows, cols
    power = np.full((r1 - r0, c1 - c0), np.nan, np.float32)
    mask = np.full(power.shape, MASK_FILL, np.uint8)
    with h5py.File(path, "r") as h5:
        g = _group(h5, frequency, path)
        if term not in DIAGONAL_TERMS:
            raise GcovError(f"{term} is not a real-valued power term; use one of {', '.join(DIAGONAL_TERMS)}")
        ds = _dataset(g, term, path)
        mds = _dataset(g, "mask", path)
        for attr in ("isReceiveOnlyChannel1", "isReceiveOnlyChannel2"):
            if _text(ds.attrs.get(attr, "False")).lower() == "true":
                raise GcovError(f"{path.name}: {term} was recorded receive-only (noise, no backscatter)")
        h, w = ds.shape
        rr0, rr1, cc0, cc1 = max(r0, 0), min(r1, h), max(c0, 0), min(c1, w)
        if rr1 > rr0 and cc1 > cc0:
            dst = np.s_[rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0]
            power[dst] = ds[rr0:rr1, cc0:cc1]  # hyperslab read: only this window leaves the file
            mask[dst] = mds[rr0:rr1, cc0:cc1]
    valid = (mask >= VALID_MASK_MIN) & (mask <= VALID_MASK_MAX) & np.isfinite(power) & (power > 0)
    power[~valid] = np.nan
    return power, mask
