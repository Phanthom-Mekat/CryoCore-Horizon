"""Single-pair GCOV backscatter change: calibrated gamma0 layers, signed dB change, findings, display PNGs.

Every output is an *observed radar change*; nothing here classifies water, flooding or damage.
See gcov.py for the verified NISAR GCOV layout and the documents it was checked against.
"""

import json
import os
import re
from pathlib import Path

import numpy as np
import shapely
from pyproj import Geod, Transformer
from rasterio.env import GDALDataFinder, PROJDataFinder
from rasterio.features import geometry_mask

# A rasterio wheel bundles PROJ/GDAL data matching its own libraries. A machine-wide PROJ_LIB/GDAL_DATA from another
# install (e.g. PostGIS) can point at an incompatible proj.db and break every CRS lookup. rasterio re-reads these
# variables each time an Env starts, so point them at the bundled data (pyproj already prefers its own).
if _proj := PROJDataFinder().search_wheel():
    os.environ["PROJ_DATA"] = _proj
if _gdal := GDALDataFinder().search_wheel():
    os.environ["GDAL_DATA"] = _gdal

from . import change, findings, render, sensitivity
from .gcov import DIAGONAL_TERMS, GcovError, full_grid, metadata, power_terms, read, window_for_bounds
from .grid import after_on_grid, pixel_area_km2

__all__ = ["process_pair", "GcovError", "NoValidCoverage", "METHOD_NAME", "METHOD_VERSION", "DEFAULT_PARAMS"]

METHOD_NAME = "Single-pair signed gamma0 backscatter change"
METHOD_VERSION = "0.2.0"  # 0.2.0: adds the cross-polarization comparison; detection unchanged
FINDING_ID_VERSION = "0.1.0"  # seeds finding ids; bump only when detection changes, so shared links keep working
DEFAULT_PARAMS = {
    "polarization": None,  # None: first of HHHH, VVVV, HVHV, VHVH present in both files
    "frequency": None,  # None: A when it has the polarization in both files, else B
    "speckle_size": 5,  # boxcar mean of linear power before dB; 1 disables
    "threshold_db": 3.0,
    "opening_px": 3,  # square morphological opening of candidate pixels; 1 disables
    "min_region_km2": 0.02,
    "max_findings": 40,
    "display_db_min": -25.0,
    "display_db_max": 0.0,
    "change_limit_db": 6.0,  # matches CHANGE.limitDb in src/lib/chattogram/palette.ts
    "max_png_px": 2000,
    "weak_area_km2": 0.05,
    "weak_margin_db": 1.0,
    "weak_valid_fraction": 0.7,
    "strong_area_km2": 0.25,
    "strong_margin_db": 2.0,
    "strong_valid_fraction": 0.9,
}
SYNTHETIC_CAVEAT = ("SYNTHETIC QA DATA - NOT NISAR: these inputs are generated test fixtures, so every layer, number "
                    "and region here is made up and describes no real place or date.")
TERM_NAMES = {"HHHH": "HH", "VVVV": "VV", "HVHV": "HV", "VHVH": "VH", "RHRH": "RH", "RVRV": "RV"}
CROSS_TERMS = {"HHHH": "HVHV", "VVVV": "VHVH"}  # the co-pol term detects; its cross-pol term is shown alongside


class NoValidCoverage(GcovError):
    """No pixel of the analysis area is valid on both dates."""


def _params(params: dict | None) -> dict:
    unknown = set(params or {}) - set(DEFAULT_PARAMS)
    if unknown:
        raise ValueError(f"unknown processing parameters: {', '.join(sorted(unknown))}")
    p = {**DEFAULT_PARAMS, **(params or {})}
    if p["threshold_db"] <= 0 or p["speckle_size"] < 1 or p["opening_px"] < 1 or p["min_region_km2"] < 0:
        raise ValueError("threshold_db must be > 0, speckle_size and opening_px >= 1, min_region_km2 >= 0")
    if p["display_db_max"] <= p["display_db_min"] or p["change_limit_db"] <= 0:
        raise ValueError("display scale must be increasing and change_limit_db > 0")
    return p


def _choose_band(before: Path, after: Path, p: dict) -> tuple[str, str]:
    tb, ta = power_terms(before), power_terms(after)
    freqs = [p["frequency"]] if p["frequency"] else ["A", "B"]
    terms = [p["polarization"]] if p["polarization"] else list(DIAGONAL_TERMS)
    for f in freqs:
        for t in terms:
            if t in tb.get(f, []) and t in ta.get(f, []):
                return f, t
    raise GcovError(
        f"requested layer {p['polarization'] or 'any power term'} on frequency {p['frequency'] or 'A/B'} "
        f"is missing from one of the files (before has {tb}, after has {ta})")


def _date(path: Path, source: dict) -> str | None:
    start = metadata(path)["start_time"]
    return start[:10] if start and re.match(r"\d{4}-\d{2}-\d{2}", start) else source.get("date")


def _caveats(p: dict, sources: list[dict], how: str, excluded_share: float, total: int, term: str,
             cross: str | None) -> list[str]:
    pol = TERM_NAMES.get(term, term)
    polarization = (f"Regions are detected in {pol} only. {TERM_NAMES[cross]} is processed the same way and shown "
                    "alongside each finding for comparison; it is not used to detect or grade regions, and the two "
                    "polarizations can respond differently to the same surface." if cross else
                    f"Single polarization ({pol}); other polarizations can respond differently.")
    out = [
        "Single before/after pair: this is a difference between two dates, not a trend, and it cannot say when "
        "between them a change happened.",
        f"Radar speckle: a {p['speckle_size']}×{p['speckle_size']} boxcar mean reduces but does not remove it; "
        f"small or thin regions near the ±{p['threshold_db']:g} dB threshold can be noise, and the filter blurs "
        f"region edges by up to {p['speckle_size'] // 2} pixels, which enlarges small regions.",
        "Tide state, river stage and wind on water can differ between the two acquisition times; on estuaries and "
        "coasts this alone can change backscatter strongly.",
        "Wet soil after rain, crop growth or harvest, vegetation, construction and moving ships all change "
        "backscatter; this method measures the change, not its cause.",
        "Layover and shadow on steep slopes are not separately masked; terrain correction (RTC) reduces but does "
        "not remove these geometry effects.",
        polarization,
        "No independent reference validation yet: each region is an observed radar change, not a confirmed water, "
        "flood or damage finding.",
    ]
    for s in sources:
        m = re.search(r"BETA|PROVISIONAL", str(s.get("collection", "")), re.I)
        if m:
            out.append(f"Source data maturity is {m.group(0).lower()} ({s['collection']}): calibration and "
                       "processing may change in later releases.")
            break
    if how.startswith("resampled"):
        out.append("The after image was resampled onto the before grid; small misregistration can create "
                   "spurious change along sharp edges.")
    if excluded_share > 0.05:
        out.append(f"{excluded_share:.0%} of the analysis area has no valid observation on both dates and is "
                   "excluded from every figure.")
    if total > p["max_findings"]:
        out.append(f"Only the {p['max_findings']} largest of {total} change regions are listed as findings; "
                   "area totals include all of them.")
    return out


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def process_pair(before_h5: Path, after_h5: Path, analysis_area, out_dir: Path, sources: list[dict],
                 params: dict | None = None) -> dict:
    """Process one before/after GCOV pair over analysis_area (shapely Polygon, EPSG:4326) into out_dir.

    Writes before_db.png, after_db.png, change_db.png, findings.geojson, timeseries.json, sensitivity.json. The caller
    publishes out_dir atomically. Raises GcovError (or NoValidCoverage) with a plain message when the data cannot support it.
    """
    before_h5, after_h5, out_dir = Path(before_h5), Path(after_h5), Path(out_dir)
    p = _params(params)
    if len(sources) != 2:
        raise ValueError("sources must be [before, after]")
    if analysis_area.is_empty or not analysis_area.is_valid or analysis_area.geom_type not in ("Polygon",
                                                                                               "MultiPolygon"):
        raise ValueError("analysis_area must be a valid, non-empty polygon in EPSG:4326")
    frequency, term = _choose_band(before_h5, after_h5, p)

    # Window on the before grid around the polygon, padded so the speckle filter has full support at the edges.
    fg = full_grid(before_h5, frequency)
    to_map = Transformer.from_crs("EPSG:4326", fg.crs, always_xy=True)
    area_map = shapely.transform(analysis_area, lambda c: np.column_stack(to_map.transform(c[:, 0], c[:, 1])))
    win = window_for_bounds(fg, area_map.bounds, pad=p["speckle_size"] // 2 + p["opening_px"] + 1)
    if win is None:
        raise NoValidCoverage(f"the analysis area does not overlap the before acquisition ({before_h5.name})")
    r0, r1, c0, c1 = win
    grid = fg.window_grid(r0, c0, r1 - r0, c1 - c0)
    before_power, _ = read(before_h5, frequency, term, (r0, r1), (c0, c1))
    after_power, _, how = after_on_grid(after_h5, frequency, term, grid)

    inside = geometry_mask([area_map], out_shape=(grid.height, grid.width), transform=grid.transform, invert=True)
    bp, ap = change.boxcar(before_power, p["speckle_size"]), change.boxcar(after_power, p["speckle_size"])
    valid_b, valid_a = np.isfinite(bp) & inside, np.isfinite(ap) & inside
    common = valid_b & valid_a
    if not common.any():
        raise NoValidCoverage(
            f"no pixel inside the analysis area is valid on both dates (before: {int(valid_b.sum())} valid, "
            f"after: {int(valid_a.sum())} valid); check footprints and masks, or choose another pair")

    bdb, adb = change.to_db(bp), change.to_db(ap)
    delta = np.where(common, adb - bdb, np.nan).astype(np.float32)
    pixel_km2 = pixel_area_km2(grid)
    min_px = change.min_pixels(p["min_region_km2"], pixel_km2)
    regions = {kind: change.regions(delta, sign, p["threshold_db"], p["opening_px"], min_px)
               for kind, sign in change.SIGNS}

    granules = [s.get("granule") or path.stem for s, path in zip(sources, (before_h5, after_h5))]
    # Cross-polarization (HV for HH): same window, filter and grid, over pixels valid in both polarizations.
    cross = CROSS_TERMS.get(term)
    if not (cross and cross in power_terms(before_h5).get(frequency, [])
            and cross in power_terms(after_h5).get(frequency, [])):
        cross = None
    xdelta = None
    if cross:
        xb, _ = read(before_h5, frequency, cross, (r0, r1), (c0, c1))
        xa, _, _ = after_on_grid(after_h5, frequency, cross, grid)
        xbp, xap = change.boxcar(xb, p["speckle_size"]), change.boxcar(xa, p["speckle_size"])
        xvalid_b, xvalid_a = np.isfinite(xbp) & inside, np.isfinite(xap) & inside
        xbdb, xadb = change.to_db(xbp), change.to_db(xap)
        xdelta = np.where(common & xvalid_b & xvalid_a, xadb - xbdb, np.nan).astype(np.float32)

    fc, total, listed = findings.build(regions, delta, bdb, adb, common, inside, grid, pixel_km2,
                               p, f"{granules[0]}|{granules[1]}|{FINDING_ID_VERSION}", cross_delta=xdelta)

    analysis_km2 = abs(Geod(ellps="WGS84").geometry_area_perimeter(analysis_area)[0]) / 1e6
    valid_km2 = int(common.sum()) * pixel_km2
    metrics = {
        "analysis_km2": round(analysis_km2, 4),
        "valid_common_km2": round(valid_km2, 4),
        "excluded_km2": round(max(analysis_km2 - valid_km2, 0.0), 4),
        "increase_km2": round(int(regions["increase"][1].sum()) * pixel_km2, 4),
        "decrease_km2": round(int(regions["decrease"][1].sum()) * pixel_km2, 4),
        "threshold_db": p["threshold_db"],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    dst, w, h, corners = render.display_grid(grid, p["max_png_px"])
    lo, hi = p["display_db_min"], p["display_db_max"]
    dates = [_date(before_h5, sources[0]), _date(after_h5, sources[1])]
    pol = TERM_NAMES.get(term, term)
    crs_note = (f"Reprojected from EPSG:{grid.epsg} to EPSG:4326 north-up for display; corners are the image "
                "outer edges. Values for analysis come from the native grid.")
    layers = []
    for lid, values, label, date in (("before_db", np.where(valid_b, bdb, np.nan), f"Before · γ⁰ {pol}", dates[0]),
                                     ("after_db", np.where(valid_a, adb, np.nan), f"After · γ⁰ {pol}", dates[1])):
        render.save_png(render.gray_rgba(render.warp(values, grid, dst, w, h), lo, hi), out_dir / f"{lid}.png")
        layers.append({"id": lid, "label": f"{label} (dB)", "date": date, "file": f"{lid}.png", "corners": corners,
                       "crs_note": crs_note, "units": "dB", "scale": {"min": lo, "max": hi}, "palette": "gray",
                       "nodata": "transparent", "polarization": pol})
    limit = p["change_limit_db"]
    render.save_png(render.diverging_rgba(render.warp(delta, grid, dst, w, h), limit), out_dir / "change_db.png")
    layers.append({"id": "change_db", "label": "Observed radar change, after − before (dB)", "file": "change_db.png",
                   "corners": corners, "crs_note": crs_note, "units": "dB", "scale": {"min": -limit, "max": limit},
                   "palette": "diverging", "nodata": "transparent", "polarization": pol})
    if cross:
        xpol = TERM_NAMES[cross]
        for lid, values, label, date in (("before_hv_db", np.where(xvalid_b, xbdb, np.nan), "Before", dates[0]),
                                         ("after_hv_db", np.where(xvalid_a, xadb, np.nan), "After", dates[1])):
            render.save_png(render.gray_rgba(render.warp(values, grid, dst, w, h), lo, hi), out_dir / f"{lid}.png")
            layers.append({"id": lid, "label": f"{label} · γ⁰ {xpol} (dB)", "date": date, "file": f"{lid}.png",
                           "corners": corners, "crs_note": crs_note, "units": "dB", "scale": {"min": lo, "max": hi},
                           "palette": "gray", "nodata": "transparent", "polarization": xpol})
        render.save_png(render.diverging_rgba(render.warp(xdelta, grid, dst, w, h), limit), out_dir / "change_hv_db.png")
        layers.append({"id": "change_hv_db", "label": f"Radar change in {xpol}, after − before (dB); not used for detection",
                       "file": "change_hv_db.png", "corners": corners, "crs_note": crs_note, "units": "dB",
                       "scale": {"min": -limit, "max": limit}, "palette": "diverging", "nodata": "transparent",
                       "polarization": xpol})
        xd = xdelta[np.isfinite(xdelta)].astype(np.float64)
        p10, p50, p90 = np.percentile(xd, [10, 50, 90])
        compared = [f["properties"] for f in fc["features"] if f["properties"]["cross_pol_mean_delta_db"] is not None]
        same = sum(1 for f in compared if (f["cross_pol_mean_delta_db"] > 0) == (f["kind"] == "increase"))
        metrics["cross_pol"] = {
            "polarization": xpol, "valid_km2": round(int(xd.size) * pixel_km2, 4),
            "median_change_db": round(float(p50), 2), "p10_change_db": round(float(p10), 2),
            "p90_change_db": round(float(p90), 2), "findings_same_direction": same, "findings_compared": len(compared),
            "note": f"{xpol} is processed like {pol} but does not detect or grade regions. A finding changes in the same "
                    f"direction in {xpol} when its {xpol} mean change has the same sign as its {pol} change.",
        }

    # Both dates over the same common-valid pixels, so the two points are comparable.
    points = []
    for date, granule, power, db in ((dates[0], granules[0], bp, bdb), (dates[1], granules[1], ap, adb)):
        p10, p90 = np.percentile(db[common].astype(np.float64), [10, 90])
        points.append({"date": date, "granule": granule,
                       "mean_db": round(float(10 * np.log10(np.mean(power[common], dtype=np.float64))), 2),
                       "p10_db": round(float(p10), 2), "p90_db": round(float(p90), 2),
                       "valid_km2": round(valid_km2, 4)})
    _write_json(out_dir / "findings.geojson", fc)
    _write_json(out_dir / "timeseries.json", {"units": "dB", "points": points})
    _write_json(out_dir / "sensitivity.json", sensitivity.sweep(delta, regions, listed, p, min_px, pixel_km2))

    conv = metadata(before_h5)["normalization"]
    synthetic = metadata(before_h5)["synthetic_fixture"] or metadata(after_h5)["synthetic_fixture"]
    method_params = {
        **p,
        "polarization": term,
        "cross_polarization": cross,
        "frequency": frequency,
        "backscatter": f"{conv or 'gamma0 (per product specification)'}, RTC-corrected linear power, "
                       "converted with 10*log10",
        "speckle_filter": f"boxcar mean of valid linear power, {p['speckle_size']}x{p['speckle_size']}, before dB",
        "valid_pixel": "mask 1..5 on both dates, finite, power > 0, pixel centre inside the analysis area",
        "grid_alignment": how,
        "grid": {"epsg": grid.epsg, "posting_m": list(grid.posting), "width": grid.width, "height": grid.height},
        "area_method": "pixel count × posting² ÷ projection areal scale factor (pyproj get_factors) at the window "
                       "centre; analysis_km2 is the geodesic polygon area (pyproj Geod, WGS84)",
        "pixel_area_m2": round(pixel_km2 * 1e6, 3),
        "min_region_px": min_px,
        "connectivity": 4,
        "timeseries_stats": "over pixels valid on both dates; mean_db = 10*log10(mean linear power)",
    }
    excluded_share = metrics["excluded_km2"] / analysis_km2 if analysis_km2 else 0.0
    return {
        "method": {"name": METHOD_NAME, "version": METHOD_VERSION, "params": method_params},
        "metrics": metrics,
        "caveats": ([SYNTHETIC_CAVEAT] if synthetic else []) + _caveats(p, sources, how, excluded_share, total, term, cross),
        "synthetic_fixture": synthetic,
        "layers": layers,
        "findings_count": len(fc["features"]),
        "timeseries_points": points,
    }
