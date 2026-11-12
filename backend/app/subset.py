"""Bounded, reproducible frequency-A radar-change pilot; no flood classification."""
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import h5py
import httpx
import numpy as np
import rasterio
from affine import Affine
from pyproj import Transformer
from rasterio.features import geometry_mask
from shapely.geometry import mapping
from shapely.ops import transform as transform_geometry

from .config import BACKEND_ROOT, Settings
from .database import Database
from .explorer import boundary, footprint
from .inspection import InspectionError, RemoteFile, main_asset, scalar
from .pairs import assess_pair

BEFORE = "G4241673561-ASF"
AFTER = "G4362350526-ASF"
METHOD = "gcov-window-v1"
PIXELS = 256
CENTER = (91.845, 22.33)


def valid_power(power, mask, exceptions, subswaths):
    if power.shape != mask.shape or power.shape != exceptions.shape:
        raise InspectionError("Power and quality-mask dimensions differ.")
    return np.isfinite(power) & (power > 0) & (mask >= 1) & (mask <= subswaths) & (exceptions == 0)


def decibels(power, valid):
    result = np.full(power.shape, np.nan, dtype="float32")
    result[valid] = 10 * np.log10(power[valid])
    return result


def calculate(before, after, roi, pixel_area):
    layers, stats = {}, {}
    for pol in ("HHHH", "HVHV"):
        a = valid_power(before[pol], before["mask"], before["inputDataExceptionMask"], before["subswaths"]) & roi
        b = valid_power(after[pol], after["mask"], after["inputDataExceptionMask"], after["subswaths"]) & roi
        common = a & b
        if not common.any(): raise InspectionError("No valid common pixels; no change product published.")
        first, second = decibels(before[pol], a), decibels(after[pol], b)
        delta = np.full(first.shape, np.nan, dtype="float32")
        delta[common] = second[common] - first[common]
        layers.update({f"before-{pol}": first, f"after-{pol}": second, f"change-{pol}": delta,
                       f"common-{pol}": common.astype("uint8")})
        stats[pol] = {"window_pixels": int(roi.size), "outside_roi_pixels": int(roi.size - roi.sum()),
                      "outside_roi_area_km2": float((roi.size - roi.sum()) * pixel_area / 1e6),
                      "roi_pixels": int(roi.sum()), "before_valid_pixels": int(a.sum()),
                      "after_valid_pixels": int(b.sum()), "common_valid_pixels": int(common.sum()),
                      "excluded_pixels": int(roi.sum() - common.sum()),
                      "common_area_km2": float(common.sum() * pixel_area / 1e6),
                      "excluded_area_km2": float((roi.sum() - common.sum()) * pixel_area / 1e6),
                      "median_change_db": float(np.median(delta[common])),
                      "change_percentiles_db": np.percentile(delta[common], [5, 50, 95]).tolist()}
    return layers, stats


def extract(scene, report, token, client, window=None):
    url, asset = main_asset(scene)
    reader = RemoteFile(client, url, asset["SizeInBytes"], token, budget=128 * 1024**2)
    reader.etag = report["etag"]
    with h5py.File(reader, "r") as file:
        group = file["science/LSAR/GCOV/grids/frequencyA"]
        epsg = int(group["projection"][()])
        if epsg != 32646: raise InspectionError("Pilot requires the inspected EPSG:32646 grid.")
        dx, dy = float(group["xCoordinateSpacing"][()]), float(group["yCoordinateSpacing"][()])
        if dx != 20 or dy != -20: raise InspectionError("Pilot requires the inspected 20 m north-up grid.")
        if window is None:
            x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(*CENTER)
            col = round((x - float(group["xCoordinates"][0])) / dx) - PIXELS // 2
            row = round((y - float(group["yCoordinates"][0])) / dy) - PIXELS // 2
            window = (row, col)
        row, col = window
        shape = group["HHHH"].shape
        if row < 0 or col < 0 or row + PIXELS > shape[0] or col + PIXELS > shape[1]:
            raise InspectionError("Requested window falls outside the source grid.")
        xs = group["xCoordinates"][col:col + PIXELS]
        ys = group["yCoordinates"][row:row + PIXELS]
        if not np.allclose(np.diff(xs), dx) or not np.allclose(np.diff(ys), dy):
            raise InspectionError("Nonuniform source coordinates; explicit alignment required.")
        affine = Affine(dx, 0, float(xs[0]) - dx / 2, 0, dy, float(ys[0]) - dy / 2)
        values, metadata = {}, {}
        for name in ("HHHH", "HVHV", "mask", "inputDataExceptionMask"):
            dataset = group[name]
            if dataset.shape != shape: raise InspectionError("Layer and mask grids differ.")
            description = scalar(dataset.attrs.get("description", ""))
            if name == "mask" and not all(word in description for word in ("subswath", "255", "fully-focused")):
                raise InspectionError("Unrecognized subswath mask definition.")
            if name == "inputDataExceptionMask" and "0: no anomaly" not in description:
                raise InspectionError("Unrecognized input exception mask definition.")
            values[name] = dataset[row:row + PIXELS, col:col + PIXELS]
            metadata[name] = {"description": description, "dtype": str(dataset.dtype), "chunks": list(dataset.chunks or [])}
        values["subswaths"] = int(group["numberOfSubSwaths"][()])
    provenance = {"concept_id": scene["concept_id"], "revision_id": scene["revision_id"],
                  "granule_id": scene["granule_id"], "acquisition": scene["start_time"],
                  "collection": scene["collection"], "etag": reader.etag,
                  "catalog_checksum": asset.get("Checksum"), "full_file_checksum_verified": False,
                  "bytes_fetched": reader.transferred, "layers": metadata}
    return values, affine, window, provenance


def build(settings=None):
    settings = settings or Settings()
    if not settings.earthdata_token: raise InspectionError("EARTHDATA_TOKEN is required.")
    database = Database(settings.resolved_database_path)
    scenes = [database.get_scene(id) for id in (BEFORE, AFTER)]
    if any(s is None for s in scenes): raise InspectionError("Pilot scenes are missing from the catalog.")
    reports = [database.get_inspection(s["concept_id"], s["revision_id"]) for s in scenes]
    gate = assess_pair(*scenes, *reports)
    if not gate["frequencies"].get("frequencyA", {}).get("metadata_compatible"):
        raise InspectionError("Frequency A has not passed the pair metadata gate.")
    with httpx.Client(timeout=settings.nasa_timeout_seconds) as client:
        first, affine, window, p1 = extract(scenes[0], reports[0], settings.earthdata_token.get_secret_value(), client)
        second, other_affine, _, p2 = extract(scenes[1], reports[1], settings.earthdata_token.get_secret_value(), client, window)
    if affine != other_affine: raise InspectionError("Source grids differ; resampling has not been authorized by this method.")
    study = boundary()[0].intersection(footprint(scenes[0]["spatial_extent"])).intersection(footprint(scenes[1]["spatial_extent"]))
    projected = transform_geometry(Transformer.from_crs(4326, 32646, always_xy=True).transform, study)
    roi = geometry_mask([mapping(projected)], (PIXELS, PIXELS), affine, invert=True)
    layers, stats = calculate(first, second, roi, abs(affine.a * affine.e))
    inputs = {"method": METHOD, "sources": [{k:p[k] for k in ("concept_id", "revision_id", "etag")} for p in (p1,p2)],
              "window": list(window), "shape": [PIXELS, PIXELS], "boundary": boundary()[2]}
    id = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()[:24]
    root = BACKEND_ROOT / "data" / "cases"
    root.mkdir(parents=True, exist_ok=True)
    destination = root / id
    if destination.exists(): return json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix=".staging-", dir=root) as temporary:
        stage = Path(temporary)
        assets = []
        for name, pixels in layers.items():
            path = stage / f"{name}.tif"
            categorical = name.startswith("common-")
            with rasterio.open(path, "w", driver="GTiff", width=PIXELS, height=PIXELS, count=1,
                               dtype=str(pixels.dtype), crs="EPSG:32646", transform=affine,
                               nodata=None if categorical else np.nan, compress="deflate", tiled=True) as dst:
                dst.write(pixels, 1)
                dst.update_tags(method=METHOD, units="boolean" if categorical else "dB",
                                meaning="after minus before" if name.startswith("change-") else "valid common coverage" if categorical else "gamma0 backscatter")
            assets.append({"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                           "bytes": path.stat().st_size, "units": "boolean" if categorical else "dB"})
        bounds = rasterio.transform.array_bounds(PIXELS, PIXELS, affine)
        manifest = {"id": id, "title": "Karnaphuli radar-change pilot", "status": "processed_pilot",
                    "method": METHOD, "created_at": datetime.now(timezone.utc).isoformat(),
                    "inputs": inputs, "sources": [p1,p2], "crs": "EPSG:32646", "bounds": list(bounds),
                    "transform": list(affine)[:6], "statistics": stats, "assets": assets,
                    "validity_rule": "Inside reference boundary and both footprints; finite positive power; mask 1..numberOfSubSwaths; inputDataExceptionMask=0. Change uses intersection of date-specific valid pixels.",
                    "alignment": "Identical native pixel grids; no interpolation or resampling.",
                    "claim": "Observed radar backscatter change, not a flood or damage classification.",
                    "limitations": [item for item in gate["limitations"] if not item.startswith("Metadata gate only")] + ["Provisional calibration and mixed-mode acquisitions; no independent dated reference validation.",
                        "Subswath and exception masks do not establish absence of layover/shadow; static terrain quality layers not yet applied.",
                        "2018 reference boundary; area is projected grid area, not a surveyed area."]}
        manifest["limitations"].append("Geographic clipping excludes the river corridor in this pilot; do not infer river-water change from excluded pixels.")
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False), encoding="utf-8")
        # Publish the complete bundle as one directory; incomplete staging directories are never exposed.
        os.rename(stage, destination)
    return manifest


if __name__ == "__main__":
    try:
        result = build()
        print(json.dumps({k: result[k] for k in ("id", "statistics", "status")}, indent=2))
    except InspectionError as exc:
        raise SystemExit(str(exc)) from None
    except (OSError, KeyError):
        raise SystemExit("Subset preparation failed; no new case published. Check access, source structure and metadata gate.") from None
