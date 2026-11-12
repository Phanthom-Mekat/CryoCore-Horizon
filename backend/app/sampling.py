"""Read containing native pixels from published scientific rasters, never previews."""
from pathlib import Path
import math

import rasterio
from rasterio.warp import transform
from rasterio.windows import Window


def sample_case(root: Path, manifest: dict, longitude: float, latitude: float):
    if not math.isfinite(longitude) or not math.isfinite(latitude) or not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise ValueError("Coordinates must be finite WGS84 longitude/latitude.")
    assets = {a["name"]: a for a in manifest["assets"]}
    result = {"case_id": manifest["id"], "method": manifest["method"],
              "requested": {"longitude": longitude, "latitude": latitude},
              "sampling": "Containing native pixel; no interpolation; values are not clipped to the display legend.",
              "units": "dB", "sources": [{k:s[k] for k in ("concept_id", "revision_id", "acquisition")} for s in manifest["sources"]],
              "claim": manifest["claim"], "polarizations": {}, "pixel": None}
    with rasterio.open(root / "before-HHHH.tif") as reference:
        xs, ys = transform("EPSG:4326", reference.crs, [longitude], [latitude])
        if not math.isfinite(xs[0]) or not math.isfinite(ys[0]):
            raise ValueError("Coordinates cannot be projected onto the case grid.")
        row, col = reference.index(xs[0], ys[0])
        if not 0 <= row < reference.height or not 0 <= col < reference.width:
            return {**result, "status": "outside_extent", "reason": "This location is outside the processed window."}
        x, y = reference.xy(row, col)
        lons, lats = transform(reference.crs, "EPSG:4326", [x], [y])
        result["pixel"] = {"row": row, "column": col, "longitude": lons[0], "latitude": lats[0],
                           "crs": str(reference.crs), "size_m": [abs(reference.transform.a), abs(reference.transform.e)]}
        grid = (reference.crs, reference.transform, reference.shape)
    for pol in ("HHHH", "HVHV"):
        values = {}
        for kind in ("before", "after", "change", "common"):
            name = f"{kind}-{pol}.tif"
            if name not in assets: raise ValueError("Required published asset is missing.")
            with rasterio.open(root / name) as source:
                if (source.crs, source.transform, source.shape) != grid:
                    raise ValueError("Published raster grids do not match.")
                value = source.read(1, window=Window(col, row, 1, 1), masked=True)[0,0]
                values[kind] = float(value) if not bool(getattr(value, "mask", False)) and math.isfinite(float(value)) else None
        valid = values["common"] == 1 and all(values[k] is not None for k in ("before", "after", "change"))
        result["polarizations"][pol] = {"status": "valid" if valid else "excluded",
            "before_db": values["before"], "after_db": values["after"],
            "change_db": values["change"] if valid else None,
            "reason": None if valid else "Excluded by the study-area or quality/valid-power masks. No change measurement is available here.",
            "asset_sha256": {kind:assets[f"{kind}-{pol}.tif"]["sha256"] for kind in ("before", "after", "change", "common")}}
    result["status"] = "valid" if any(v["status"] == "valid" for v in result["polarizations"].values()) else "excluded"
    return result
