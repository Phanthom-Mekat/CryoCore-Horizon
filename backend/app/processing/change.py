"""Speckle filter, dB conversion and signed-change candidate regions."""

import math

import numpy as np
from scipy import ndimage

SIGNS = (("increase", 1), ("decrease", -1))  # change kind, sign of after − before


def boxcar(power: np.ndarray, size: int) -> np.ndarray:
    """Mean of valid linear power in a size x size box; invalid (NaN) pixels stay NaN and never contribute."""
    if size <= 1:
        return power
    valid = np.isfinite(power)
    total = ndimage.uniform_filter(np.where(valid, power, 0).astype(np.float64), size, mode="constant")
    count = ndimage.uniform_filter(valid.astype(np.float64), size, mode="constant")
    with np.errstate(invalid="ignore", divide="ignore"):
        out = total / count
    return np.where(valid, out, np.nan).astype(np.float32)


def to_db(power: np.ndarray) -> np.ndarray:
    """10*log10(power) for finite positive power, NaN elsewhere."""
    p = np.asarray(power, np.float64)
    ok = np.isfinite(p) & (p > 0)
    out = np.full(p.shape, np.nan)
    out[ok] = 10 * np.log10(p[ok])
    return out.astype(np.float32)


def regions(delta: np.ndarray, sign: int, threshold_db: float, opening_px: int, min_px: int):
    """Label 4-connected regions where sign*delta >= threshold, after a square opening, keeping >= min_px pixels.

    Returns (labels int32 renumbered 1..n in scan order, pixel counts per label index 1..n).
    """
    with np.errstate(invalid="ignore"):
        cand = np.nan_to_num(sign * delta, nan=-np.inf) >= threshold_db
    return clean(cand, opening_px, min_px)


def clean(cand: np.ndarray, opening_px: int, min_px: int):
    """Square opening of a boolean mask, then 4-connected regions of >= min_px pixels: (labels 1..n, counts)."""
    if opening_px > 1:
        cand = ndimage.binary_opening(cand, structure=np.ones((opening_px, opening_px), bool))
    labels, n = ndimage.label(cand)
    counts = np.bincount(labels.ravel(), minlength=n + 1)
    keep = np.flatnonzero(counts >= min_px)
    keep = keep[keep > 0]
    lut = np.zeros(n + 1, np.int32)
    lut[keep] = np.arange(1, keep.size + 1, dtype=np.int32)
    return lut[labels], counts[keep]


def min_pixels(min_area_km2: float, pixel_km2: float) -> int:
    return max(1, math.ceil(min_area_km2 / pixel_km2 - 1e-9))
