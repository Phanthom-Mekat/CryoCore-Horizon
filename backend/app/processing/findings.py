"""Polygonise change regions into GeoJSON findings with local statistics and a categorical quality flag."""

import hashlib

import numpy as np
import shapely
from pyproj import Transformer
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import mapping, shape

from .gcov import Grid

LABEL = "Observed radar change"


def grade(area_km2: float, mean_delta_db: float, valid_fraction: float, threshold_db: float, p: dict):
    """Categorical quality (not a calibrated probability) and a plain-language reason."""
    margin = abs(mean_delta_db) - threshold_db
    facts = (f"{area_km2:.3f} km²; mean change {mean_delta_db:+.1f} dB, {margin:.1f} dB beyond the "
             f"±{threshold_db:g} dB threshold; {valid_fraction:.0%} of pixels in and around it are valid on both dates.")
    weak = []
    if area_km2 < p["weak_area_km2"]:
        weak.append("small, close to the size of speckle and misregistration effects")
    if margin < p["weak_margin_db"]:
        weak.append("mean change only just passes the threshold")
    if valid_fraction < p["weak_valid_fraction"]:
        weak.append("many pixels around it are masked or outside coverage")
    if weak:
        return "weak", f"Weak: {'; '.join(weak)}. {facts}"
    if (area_km2 >= p["strong_area_km2"] and margin >= p["strong_margin_db"]
            and valid_fraction >= p["strong_valid_fraction"]):
        return "strong", f"Strong: large, well beyond the threshold and fully observed. {facts}"
    return "moderate", f"Moderate: passes every check, but not all by a wide margin. {facts}"


def build(regions: dict, delta, before_db, after_db, valid_common, inside, grid: Grid, pixel_km2: float,
          p: dict, id_seed: str):
    """regions: {"increase": (labels, counts), "decrease": (labels, counts)}. Returns (FeatureCollection, total)."""
    ranked = sorted(
        ((int(c), kind, i + 1) for kind, (_, counts) in regions.items() for i, c in enumerate(counts)),
        key=lambda r: (-r[0], r[1], r[2]),
    )
    total = len(ranked)
    to_wgs84 = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)

    def project(coords):
        x, y = to_wgs84.transform(coords[:, 0], coords[:, 1])
        return np.round(np.column_stack([x, y]), 7)

    boxes = {kind: ndimage.find_objects(labels) for kind, (labels, _) in regions.items()}
    features = []
    for rank, (npx, kind, lab) in enumerate(ranked[: p["max_findings"]], start=1):
        labels = regions[kind][0]
        sl = boxes[kind][lab - 1]
        # One pixel of margin around the region's box, for the neighbourhood valid fraction.
        sl = tuple(slice(max(s.start - 1, 0), s.stop + 1) for s in sl)
        region = labels[sl] == lab
        ring = ndimage.binary_dilation(ndimage.binary_fill_holes(region), np.ones((3, 3), bool)) & inside[sl]
        valid_fraction = float(valid_common[sl][ring].sum() / ring.sum())

        win = grid.window_grid(sl[0].start, sl[1].start, region.shape[0], region.shape[1])
        polys = [shape(g) for g, _ in shapes(region.astype(np.uint8), mask=region, connectivity=4,
                                              transform=win.transform)]
        geom = shapely.unary_union(polys).simplify(grid.posting[0] / 2, preserve_topology=True)
        geom = shapely.transform(geom, project)

        d = delta[sl][region]
        area = npx * pixel_km2
        mean_delta = float(np.mean(d, dtype=np.float64))
        quality, reason = grade(area, mean_delta, valid_fraction, p["threshold_db"], p)
        fid = "chg-" + hashlib.sha1(f"{id_seed}|{kind}|{rank}".encode()).hexdigest()[:12]
        features.append({
            "type": "Feature",
            "id": fid,
            "geometry": mapping(geom),
            "properties": {
                "id": fid,
                "kind": kind,
                "label": LABEL,
                "area_km2": round(area, 4),
                "mean_delta_db": round(mean_delta, 2),
                "median_before_db": round(float(np.median(before_db[sl][region])), 2),
                "median_after_db": round(float(np.median(after_db[sl][region])), 2),
                "valid_fraction": round(valid_fraction, 3),
                "quality": quality,
                "quality_reason": reason,
            },
        })
    return {"type": "FeatureCollection", "features": features}, total
