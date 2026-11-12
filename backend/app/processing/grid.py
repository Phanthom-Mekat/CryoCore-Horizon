"""Put the 'after' acquisition on the 'before' window grid, and pixel-area bookkeeping."""

from pathlib import Path

import numpy as np
from pyproj import Proj, Transformer
from rasterio.warp import Resampling, reproject, transform_bounds

from .gcov import MASK_FILL, Grid, full_grid, read, window_for_bounds

LATTICE_TOL_PX = 1e-3


def aligned(a: Grid, b: Grid) -> bool:
    """Same EPSG, same posting, and pixel corners on the same lattice."""
    if a.epsg != b.epsg or not np.allclose(a.posting, b.posting, rtol=0, atol=1e-6):
        return False
    dx, dy = a.posting
    off = np.array([(a.transform.c - b.transform.c) / dx, (a.transform.f - b.transform.f) / dy])
    return bool(np.all(np.abs(off - np.round(off)) < LATTICE_TOL_PX))


def after_on_grid(path: Path, frequency: str, term: str, target: Grid):
    """Return (power, mask, how) for the 'after' file sampled on the target grid.

    Aligned grids: exact pixel-for-pixel window (no resampling). Otherwise rasterio.warp.reproject:
    average for linear power (invalid pixels already NaN, so they never leak into valid ones), nearest for the mask.
    """
    src = full_grid(path, frequency)
    if aligned(target, src):
        dx, dy = src.posting
        c0 = int(round((target.transform.c - src.transform.c) / dx))
        r0 = int(round((src.transform.f - target.transform.f) / dy))
        power, mask = read(path, frequency, term, (r0, r0 + target.height), (c0, c0 + target.width))
        return power, mask, "exact: same EPSG, posting and pixel lattice; windows intersected without resampling"

    power = np.full((target.height, target.width), np.nan, np.float32)
    mask = np.full(power.shape, MASK_FILL, np.uint8)
    how = (f"resampled: after grid (EPSG:{src.epsg}, {src.posting[0]:g} m) reprojected onto before grid "
           f"(EPSG:{target.epsg}, {target.posting[0]:g} m) with rasterio.warp.reproject, "
           "average for linear power, nearest for mask")
    win = window_for_bounds(src, transform_bounds(target.crs, src.crs, *target.bounds, densify_pts=21), pad=2)
    if win is None:
        return power, mask, how
    r0, r1, c0, c1 = win
    sp, sm = read(path, frequency, term, (r0, r1), (c0, c1))
    sg = src.window_grid(r0, c0, r1 - r0, c1 - c0)
    common = dict(src_transform=sg.transform, src_crs=sg.crs, dst_transform=target.transform, dst_crs=target.crs)
    reproject(sp, power, src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.average, **common)
    reproject(sm, mask, src_nodata=MASK_FILL, dst_nodata=MASK_FILL, resampling=Resampling.nearest, **common)
    power[~((mask >= 1) & (mask <= 5))] = np.nan  # a reprojected pixel is valid only if its nearest mask is
    return power, mask, how


def pixel_area_km2(grid: Grid) -> float:
    """Ground area of one pixel: map-plane area divided by the projection's areal scale factor at the window centre.

    For a UTM window a few tens of km wide the scale factor varies by < 1e-4, so one value is exact enough.
    """
    left, bottom, right, top = grid.bounds
    lon, lat = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True).transform((left + right) / 2,
                                                                                      (bottom + top) / 2)
    scale = Proj(grid.crs).get_factors(lon, lat).areal_scale
    dx, dy = grid.posting
    return dx * dy / scale / 1e6
