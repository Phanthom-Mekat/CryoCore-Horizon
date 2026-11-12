"""Display PNGs: rasters reprojected to EPSG:4326 north-up, fixed shared scales, transparent no-data."""

from pathlib import Path

import numpy as np
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds

from .gcov import Grid

# Diverging palette for signed change, copied from src/lib/chattogram/palette.ts (CHANGE).
CHANGE_NEG, CHANGE_MID, CHANGE_POS = (0xC2, 0x50, 0x9A), (0x8A, 0x8F, 0x98), (0x4F, 0x9A, 0x4A)


def display_grid(grid: Grid, max_px: int):
    """EPSG:4326 grid covering the window, about the source pixel count, long side <= max_px.

    Returns (transform, width, height, corners [[lon,lat] TL, TR, BR, BL]).
    """
    west, south, east, north = transform_bounds(grid.crs, "EPSG:4326", *grid.bounds, densify_pts=21)
    shrink = max(1.0, max(grid.width, grid.height) / max_px)
    w, h = max(1, round(grid.width / shrink)), max(1, round(grid.height / shrink))
    corners = [[west, north], [east, north], [east, south], [west, south]]
    return from_bounds(west, south, east, north, w, h), w, h, [[round(x, 7), round(y, 7)] for x, y in corners]


def warp(values: np.ndarray, grid: Grid, dst_transform, w: int, h: int) -> np.ndarray:
    out = np.full((h, w), np.nan, np.float32)
    shrink = max(grid.width / w, grid.height / h)
    reproject(values.astype(np.float32), out, src_transform=grid.transform, src_crs=grid.crs, src_nodata=np.nan,
              dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
              resampling=Resampling.average if shrink > 1.01 else Resampling.nearest)
    return out


def _js_round(x):  # Math.round in palette.ts rounds .5 up
    return np.floor(x + 0.5).astype(np.uint8)


def gray_rgba(db: np.ndarray, lo: float, hi: float) -> np.ndarray:
    v = _js_round(np.clip((np.nan_to_num(db, nan=lo) - lo) / (hi - lo), 0, 1) * 255)
    alpha = np.where(np.isfinite(db), 255, 0).astype(np.uint8)
    return np.dstack([v, v, v, alpha])


def diverging_rgba(delta: np.ndarray, limit_db: float) -> np.ndarray:
    t = np.clip(np.nan_to_num(delta, nan=0.0) / limit_db, -1, 1)[..., None]
    mid, neg, pos = (np.array(c, np.float64) for c in (CHANGE_MID, CHANGE_NEG, CHANGE_POS))
    rgb = np.where(t < 0, mid + (neg - mid) * -t, mid + (pos - mid) * t)
    alpha = np.where(np.isfinite(delta), 255, 0).astype(np.uint8)
    return np.dstack([_js_round(rgb), alpha])


def save_png(rgba: np.ndarray, path: Path) -> None:
    rgba = rgba.copy()
    rgba[rgba[..., 3] == 0] = 0  # fully transparent pixels carry no colour, so bytes depend only on valid data
    Image.fromarray(rgba, "RGBA").save(path, format="PNG", optimize=False, compress_level=6)
