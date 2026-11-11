"""Read-only spatial view of stored NASA metadata. No imagery/coverage claims."""
import json
import math
from collections import Counter
from functools import lru_cache
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ASSETS = Path(__file__).parent / "assets"


@lru_cache(maxsize=1)
def boundary():
    feature = json.loads((ASSETS / "chattogram.geojson").read_text())
    provenance = json.loads((ASSETS / "boundary-source.json").read_text())
    geometry = shape(feature["geometry"])
    display = {**feature, "geometry": mapping(geometry.simplify(0.001, preserve_topology=True))}
    return geometry, {"type": "FeatureCollection", "features": [display]}, provenance


def footprint(extent):
    """Convert UMM polygons (including holes) or rectangles. Never invent extents."""
    geometry = extent.get("HorizontalSpatialDomain", {}).get("Geometry", {})

    def ring(points):
        coords = [[float(p["Longitude"]), float(p["Latitude"])] for p in points]
        if len(coords) < 3 or any(not math.isfinite(x) or not math.isfinite(y) or
                                  not -180 <= x <= 180 or not -90 <= y <= 90 for x, y in coords):
            raise ValueError("Invalid coordinates")
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        return coords

    try:
        polygons = []
        for polygon in geometry.get("GPolygons", []):
            rings = [ring(polygon["Boundary"]["Points"])]
            rings += [ring(h.get("Boundary", h)["Points"]) for h in polygon.get("ExclusiveZone", {}).get("Boundaries", [])]
            polygons.append(shape({"type": "Polygon", "coordinates": rings}))
        if not polygons:
            for box in geometry.get("BoundingRectangles", []):
                w, e, s, n = [box[k] for k in ("WestBoundingCoordinate", "EastBoundingCoordinate", "SouthBoundingCoordinate", "NorthBoundingCoordinate")]
                if w >= e or s >= n:
                    return None  # do not guess antimeridian geometry
                polygons.append(shape({"type": "Polygon", "coordinates": [ring([
                    {"Longitude": x, "Latitude": y} for x, y in [(w, s), (e, s), (e, n), (w, n)]
                ])]}))
        if not polygons or any(not p.is_valid or p.is_empty for p in polygons):
            return None
        return unary_union(polygons)
    except (KeyError, ValueError, TypeError):
        return None


def build_explorer(rows):
    division, display, provenance = boundary()
    features, excluded, missing = [], 0, 0
    for row in rows:
        scene = json.loads(row["payload"])
        geometry = footprint(scene["spatial_extent"])
        if geometry is None:
            missing += 1
            continue
        if not division.intersects(geometry):
            excluded += 1
            continue
        attributes = {a["Name"]: a.get("Values", []) for a in scene["metadata"]["umm"].get("AdditionalAttributes", [])}
        def values(name):
            return ", ".join(attributes.get(name, [])) or None
        features.append({"type": "Feature", "id": scene["concept_id"], "geometry": mapping(geometry), "properties": {
            "id": scene["concept_id"], "name": scene["granule_id"], "product": scene["product"],
            "date": scene["start_time"], "end_time": scene["end_time"],
            "track": values("TRACK_NUMBER"), "frame": values("FRAME_NUMBER"),
            "direction": values("ASCENDING_DESCENDING"), "polarization": values("FREQUENCY_A_POLARIZATION"),
            "maturity": values("DATA_MATURITY") or "Not provided in catalog",
            "revision": scene["revision_id"], "retrieved_at": scene["retrieved_at"],
            "source_url": f"https://cmr.earthdata.nasa.gov/search/concepts/{scene['concept_id']}.umm_json",
        }})
    dates = Counter(f["properties"]["date"][:10] for f in features if f["properties"]["date"])
    return {
        "region": {"name": "Chattogram Division", "country": "Bangladesh", "bbox": list(division.bounds),
                   "boundary": display, "provenance": provenance},
        "scenes": {"type": "FeatureCollection", "features": features},
        "summary": {"stored_records": len(rows), "intersecting_records": len(features),
                    "outside_division": excluded, "missing_geometry": missing,
                    "observation_days": len(dates),
                    "latest_retrieval": max((json.loads(r["payload"])["retrieved_at"] for r in rows), default=None)},
        "timeline": [{"date": date, "count": count} for date, count in sorted(dates.items())],
        "notice": "Catalog footprints show scene extent, not valid radar pixels or measured environmental change. Multiple records can share one acquisition day.",
    }
