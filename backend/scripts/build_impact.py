"""Per-ward flood impact for the curated case: June flood signal x boundaries, OSM exposure, WorldCover cropland.

Run from backend/: .venv/Scripts/python scripts/build_impact.py
Writes public/data/chattogram/impact/{impact.json, wards.geojson, roads.geojson, facilities.geojson, flood.png}.
ponytail: reads the 8-bit display PNGs (0.1 dB steps), not the native GeoTIFFs; good enough for ward ranking.
"""
import json, math, re
from pathlib import Path
import httpx, numpy as np, rasterio
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling
from scipy import ndimage
from shapely.geometry import shape, mapping, box, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "backend/data/cases/karnaphuli-estuary"
CACHE = ROOT / "backend/data/impact"
OUT = ROOT / "public/data/chattogram/impact"
OUT.mkdir(parents=True, exist_ok=True)
W, S, E, N = 91.7881341, 22.2386369, 91.9017111, 22.3813361
OVERPASS = "https://overpass.private.coffee/api/interpreter"

# --- radar: June flood signal ---------------------------------------------------------------
def db(name):
    a = np.array(Image.open(CASE / f"{name}.png"))
    return -25 + a[..., 0] / 255 * 25, a[..., 3] > 0

bdb, valid = db("before_db")
adb, valid2 = db("after_db")
valid &= valid2
H, Wpx = bdb.shape
T = from_bounds(W, S, E, N, Wpx, H)
lat_mid = math.radians((S + N) / 2)
px_km2 = ((E - W) / Wpx * 111.32 * math.cos(lat_mid)) * ((N - S) / H * 110.57)

# WorldCover 2021 on the same grid
wc = np.zeros((H, Wpx), np.uint8)
with rasterio.open("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N21E090_Map.tif") as src:
    reproject(rasterio.band(src, 1), wc, dst_transform=T, dst_crs="EPSG:4326", resampling=Resampling.nearest)
river = wc == 80  # permanent water: tide and wind change it, so it is never counted as flooding

water_june = bdb < -15
water_oct = adb < -15
# darker in June by >= 3 dB, or water-like in June and not in October; outside the permanent river
signal = valid & ~river & (((adb - bdb) >= 3) | (water_june & ~water_oct))
signal = ndimage.binary_opening(signal, iterations=1)
signal = ndimage.binary_closing(signal, iterations=1) & valid & ~river
near = ndimage.binary_dilation(signal, iterations=3)  # within ~30 m
print("flood signal km2", round(signal.sum() * px_km2, 2))

# overlay PNG: flood signal (cyan) on transparent
rgba = np.zeros((H, Wpx, 4), np.uint8)
rgba[river & valid] = (40, 70, 110, 70)
rgba[signal] = (0, 200, 255, 230)
Image.fromarray(rgba).save(OUT / "flood.png", optimize=True)

# --- wards ------------------------------------------------------------------------------------
aoi = box(W, S, E, N)
adm = json.load(open(CACHE / "adm4_area.geojson"))
def clean(n):
    m = re.match(r"Ward No-0?(\d+)", n)
    return (f"Ward {m.group(1)}", "ward") if m else (n, "union")
groups = {}
for f in adm["features"]:
    name, kind = clean(f["properties"]["shapeName"])
    g = shape(f["geometry"]).buffer(0).intersection(aoi)
    if g.area > 0:
        groups.setdefault(name, (kind, []))[1].append(g)
wards = [{"name": n, "kind": k, "geom": unary_union(gs)} for n, (k, gs) in groups.items()]
wards = [w for w in wards if w["geom"].area * 111.32 * 110.57 * math.cos(lat_mid) > 0.3]  # drop slivers < 0.3 km2
wid = rasterize([(w["geom"], i + 1) for i, w in enumerate(wards)], out_shape=(H, Wpx), transform=T, fill=0, dtype="int32")

# --- OSM exposure -----------------------------------------------------------------------------
def overpass(q, cache):
    p = CACHE / cache
    if not p.exists():
        r = httpx.post(OVERPASS, data={"data": q}, timeout=180)
        r.raise_for_status()
        p.write_text(r.text, encoding="utf-8")
    return json.loads(p.read_text(encoding="utf-8"))["elements"]

bb = f"({S},{W},{N},{E})"
roads = overpass(f'[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)(_link)?$"]{bb};out geom;', "roads.json")
try:
    pois = overpass(f'[out:json][timeout:100];nwr[amenity~"^(school|college|university|hospital|clinic|doctors|marketplace|shelter|fire_station|police)$"]{bb};out center tags;', "pois.json")
except Exception:  # ponytail: Overpass busy -> the hospital/shelter points the my-area page already fetched
    (CACHE / "pois.json").unlink(missing_ok=True)
    places = json.load(open(ROOT / "public/data/chattogram/myarea/places.json", encoding="utf-8"))["places"]
    pois = [{"lon": p["lon"], "lat": p["lat"], "tags": {"amenity": p["kind"], "name": p["name"] or "", "name:bn": p.get("name_bn") or ""}} for p in places]

def pix(lon, lat):
    r, c = rasterio.transform.rowcol(T, lon, lat)
    return (r, c) if 0 <= r < H and 0 <= c < Wpx else None

MAJOR = {"motorway", "trunk", "primary", "secondary", "tertiary"}
road_feats, cut = [], {}
for w in roads:
    pts = [(p["lon"], p["lat"]) for p in w.get("geometry", [])]
    if len(pts) < 2: continue
    line = LineString(pts)
    km_per_deg = 111.32 * math.cos(lat_mid)
    n = max(2, int(line.length * km_per_deg * 1000 / 10))  # a sample every ~10 m
    run = []
    cls = w["tags"]["highway"].replace("_link", "")
    def flush():
        if len(run) > 1:
            seg = LineString(run)
            km = seg.length * km_per_deg
            rc = pix(*run[len(run) // 2])
            i = wid[rc] if rc else 0
            if i: cut.setdefault(i, {"km": 0.0, "major": 0.0}); cut[i]["km"] += km; cut[i]["major"] += km if cls in MAJOR else 0
            road_feats.append({"type": "Feature", "geometry": mapping(seg), "properties": {"name": w["tags"].get("name", ""), "class": cls, "major": cls in MAJOR, "km": round(km, 3)}})
        run.clear()
    for k in range(n + 1):
        p = line.interpolate(k / n, normalized=True)
        rc = pix(p.x, p.y)
        if rc and signal[rc]: run.append((round(p.x, 6), round(p.y, 6)))
        else: flush()
    flush()

KIND = {"school": "school", "college": "school", "university": "school", "hospital": "health", "clinic": "health", "doctors": "health",
        "marketplace": "market", "shelter": "shelter", "fire_station": "emergency", "police": "emergency"}
fac_feats, fac_count = [], {}
for e in pois:
    lon, lat = (e["lon"], e["lat"]) if "lon" in e else (e["center"]["lon"], e["center"]["lat"])
    rc = pix(lon, lat)
    if not rc: continue
    kind = "shelter" if e["tags"].get("emergency") == "assembly_point" else KIND.get(e["tags"].get("amenity"), "other")
    hit = bool(near[rc])
    i = int(wid[rc])
    if hit and i: fac_count.setdefault(i, {}); fac_count[i][kind] = fac_count[i].get(kind, 0) + 1
    fac_feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                      "properties": {"name": e["tags"].get("name:en") or e["tags"].get("name") or kind.title(), "name_bn": e["tags"].get("name:bn", ""),
                                     "kind": kind, "affected": hit, "ward": wards[i - 1]["name"] if i else ""}})

# --- per-ward stats ---------------------------------------------------------------------------
rows = []
for i, w in enumerate(wards, 1):
    m = (wid == i) & valid
    land = m & ~river
    sig = m & signal
    crop = land & (wc == 40)
    built = land & (wc == 50)
    fc = fac_count.get(i, {})
    rows.append({
        "id": re.sub(r"\W+", "-", w["name"].lower()).strip("-"), "name": w["name"], "kind": w["kind"],
        "area_km2": round(m.sum() * px_km2, 2), "land_km2": round(land.sum() * px_km2, 2),
        "water_km2": round(sig.sum() * px_km2, 3), "water_pct": round(100 * sig.sum() / max(land.sum(), 1), 1),
        "crop_ha": round((sig & crop).sum() * px_km2 * 100, 1), "crop_total_ha": round(crop.sum() * px_km2 * 100, 1),
        "built_ha": round((sig & built).sum() * px_km2 * 100, 1),
        "roads_km": round(cut.get(i, {}).get("km", 0), 2), "major_roads_km": round(cut.get(i, {}).get("major", 0), 2),
        "facilities": sum(fc.values()), "facility_kinds": fc,
        "center": [round(w["geom"].representative_point().x, 5), round(w["geom"].representative_point().y, 5)],
    })

def norm(k):
    mx = max(r[k] for r in rows) or 1
    return {r["id"]: r[k] / mx for r in rows}
nw, nr, nf, nc = norm("water_pct"), norm("roads_km"), norm("facilities"), norm("crop_ha")
for r in rows:
    r["score"] = round(100 * (0.4 * nw[r["id"]] + 0.25 * nr[r["id"]] + 0.2 * nf[r["id"]] + 0.15 * nc[r["id"]]), 1)
    r["level"] = "severe" if r["score"] >= 45 else "high" if r["score"] >= 25 else "moderate" if r["score"] >= 10 else "low"
rows.sort(key=lambda r: -r["score"])
for k, r in enumerate(rows, 1): r["rank"] = k

geo = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "id": k, "geometry": mapping(next(w["geom"] for w in wards if w["name"] == r["name"]).simplify(0.0001)),
     "properties": {kk: v for kk, v in r.items() if kk not in ("facility_kinds", "center")}} for k, r in enumerate(rows)]}

summary = {
    "water_km2": round(signal.sum() * px_km2, 2), "crop_ha": round(sum(r["crop_ha"] for r in rows), 1),
    "roads_km": round(sum(f["properties"]["km"] for f in road_feats), 1),
    "major_roads_km": round(sum(f["properties"]["km"] for f in road_feats if f["properties"]["major"]), 1),
    "facilities": sum(1 for f in fac_feats if f["properties"]["affected"]), "facilities_total": len(fac_feats),
    "areas": len(rows), "areas_severe": sum(r["level"] in ("severe", "high") for r in rows),
}
impact = {
    "case": "karnaphuli-estuary", "before": "2026-06-18", "after": "2026-10-16",
    "bounds": [W, S, E, N], "overlay": "/data/chattogram/impact/flood.png",
    "method": "Flood signal: NISAR L-band HH gamma0 at least 3 dB darker on 18 Jun 2026 than on 16 Oct 2026, or below -15 dB in June only; "
              "permanent water (ESA WorldCover 2021 class 80) excluded; 3x3 opening/closing. Roads and facilities: OpenStreetMap; cropland: ESA WorldCover class 40; "
              "areas: BBS/OCHA ADM4 via geoBoundaries. A radar signal of wet or flooded ground, not a measured flood depth.",
    "score": "0.40 x flooded share of land + 0.25 x road km + 0.20 x facilities within 30 m + 0.15 x cropland ha, each scaled to the worst area",
    "summary": summary, "wards": rows,
}
json.dump(impact, open(OUT / "impact.json", "w"), ensure_ascii=False)
json.dump(geo, open(OUT / "wards.geojson", "w"))
json.dump({"type": "FeatureCollection", "features": road_feats}, open(OUT / "roads.geojson", "w"))
json.dump({"type": "FeatureCollection", "features": fac_feats}, open(OUT / "facilities.geojson", "w"), ensure_ascii=False)
print(json.dumps(summary))
for r in rows[:10]: print(r["rank"], r["name"], r["score"], r["water_pct"], r["roads_km"], r["facilities"], r["crop_ha"])
