"""
NISAR -> dashboard data for Jakobshavn Glacier (Sermeq Kujalleq).

Writes public/data/jakobshavn/ in the same format as scripts/make-sample-data.mjs (see src/lib/dashboard-data.ts):
  manifest.json, timeseries.json, fronts.json, speed/<start>_<end>.png, radar/<date>.webp

Steps (run in order):
  python scripts/nisar_pipeline.py search   --start 2025-10-01 --end 2026-11-15    # track 170 frame 53 by default
                                           (Nov 2026: 15 GOFF + 18 GCOV files, ~0.9 GB each, ~31 GB total)
  python scripts/nisar_pipeline.py download
  python scripts/nisar_pipeline.py inspect  data/raw/<some GOFF file>.h5     # check layer paths before building
  python scripts/nisar_pipeline.py build

Needs: pip install asf_search h5py numpy pyproj scipy pillow
Login: a NASA Earthdata account, read from EARTHDATA_USERNAME / EARTHDATA_PASSWORD or from ~/.netrc
(machine urs.earthdata.nasa.gov). Never commit credentials.

Products (ASF NISAR user guide, nisar-docs.asf.alaska.edu):
  GCOV  L2 geocoded backscatter, UTM, 10/20 m. Layer /science/LSAR/GCOV/grids/frequencyA/HHHH (gamma-0 power).
  GOFF  L2 geocoded pixel offsets between two passes, 80 m, UTM or polar stereographic.
        Its layer paths are not confirmed here: `inspect` prints them, and `find_layer` matches by name.

Known simplifications (say so in the submission):
  - Speed from GOFF = hypot(along-track offset, slant-range offset / sin(incidence)) / days. Incidence comes from
    the product metadata when present, else a 37° mid-swath guess. Not a full 3-D velocity inversion.
  - The calving front is picked along one flowline as the strongest step from mélange to ice in backscatter.
    Good for a position-through-time record, not a mapped front outline.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "jakobshavn"

BBOX = (-51.3, 68.95, -48.3, 69.35)  # lon min, lat min, lon max, lat max (EPSG:4326)
GRID_W, GRID_H = 400, 150  # speed grid, ~300 m
RADAR_W, RADAR_H = 1000, 375
SPEED_MAX = 45.0  # m/day at PNG code 255
FLOWLINE = [(-49.7962, 69.1527), (-49.5787, 69.154), (-49.4212, 69.1567), (-49.2337, 69.1593),
            (-49.0462, 69.1647), (-48.8587, 69.1753), (-48.6712, 69.1833), (-48.3037, 69.1913)]
PROBES = [{"id": "front", "label": "Near the front", "lon": -49.5187, "lat": 69.154},
          {"id": "upstream", "label": "20 km upstream", "lon": -49.0762, "lat": 69.1647}]
WKT = "POLYGON(({0} {1},{2} {1},{2} {3},{0} {3},{0} {1}))".format(*BBOX)


# ---------------------------------------------------------------- search / download
def cmd_search(a):
    import asf_search as asf

    rows = []
    for level in ("GCOV", "GOFF"):
        res = asf.search(dataset="NISAR", processingLevel=level, intersectsWith=WKT, start=a.start, end=a.end)
        for r in res:
            p = r.properties
            url = p.get("url") or ""
            if not url.endswith(".h5"):  # skip .met/.log/browse files
                continue
            if a.track and (p.get("pathNumber") != a.track or p.get("frameNumber") != a.frame):
                continue  # one viewing geometry keeps the time series consistent
            rows.append({"level": level, "name": p.get("fileName") or p.get("sceneName"), "url": url,
                         "start": p.get("startTime"), "track": p.get("pathNumber"), "frame": p.get("frameNumber"),
                         "direction": (p.get("flightDirection") or "?")[:1].upper()})
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "granules.json").write_text(json.dumps(rows, indent=1))
    by = {lv: sum(r["level"] == lv for r in rows) for lv in ("GCOV", "GOFF")}
    print(f"found {by['GCOV']} GCOV and {by['GOFF']} GOFF files -> {RAW / 'granules.json'}")
    if not rows:
        print("Nothing found. Widen the dates, or check the product names in Vertex (search.asf.alaska.edu).")


def cmd_download(a):
    import asf_search as asf

    rows = json.loads((RAW / "granules.json").read_text())
    session = asf.ASFSession()
    user, pw = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if user and pw:
        session.auth_with_creds(user, pw)  # otherwise requests falls back to ~/.netrc
    todo = [r["url"] for r in rows if not (RAW / Path(r["url"]).name).exists()]
    print(f"downloading {len(todo)} files to {RAW} (already have {len(rows) - len(todo)})")
    asf.download_urls(urls=todo, path=str(RAW), session=session, processes=4)


# ---------------------------------------------------------------- HDF5 helpers
def cmd_inspect(a):
    import h5py

    with h5py.File(a.file, "r") as f:
        def show(name, obj):
            if isinstance(obj, h5py.Dataset):
                units = obj.attrs.get("units", b"")
                units = units.decode() if isinstance(units, bytes) else units
                print(f"{name}  {obj.shape} {obj.dtype} {units}")
        f.visititems(show)


def find_layer(f, *must: str, exclude: tuple[str, ...] = ()):
    """First dataset whose path contains every string in `must` (case-insensitive)."""
    hits = []
    f.visititems(lambda n, o: hits.append(n) if hasattr(o, "shape") and all(m.lower() in n.lower() for m in must)
                 and not any(e.lower() in n.lower() for e in exclude) else None)
    return sorted(hits, key=len)[0] if hits else None


def grid_of(f, layer_path: str):
    """x/y coordinate vectors and EPSG code for the grid group holding `layer_path`."""
    group = layer_path.rsplit("/", 1)[0]
    while group and not (f"{group}/xCoordinates" in f):
        group = group.rsplit("/", 1)[0] if "/" in group else ""
    if not group:
        raise RuntimeError(f"no xCoordinates/yCoordinates near {layer_path}; run `inspect` and adjust grid_of()")
    x, y = f[f"{group}/xCoordinates"][()], f[f"{group}/yCoordinates"][()]
    epsg = None
    if f"{group}/projection" in f:
        attrs = f[f"{group}/projection"].attrs
        epsg = attrs.get("epsg_code")
        if epsg is None:
            m = re.search(r'AUTHORITY\["EPSG","(\d+)"\]\]$', str(attrs.get("spatial_ref", "")))
            epsg = int(m.group(1)) if m else None
    if epsg is None:
        raise RuntimeError(f"no EPSG code in {group}/projection; run `inspect` and adjust grid_of()")
    return x, y, int(epsg)


def sample_to_lonlat(f, layer: str, w: int, h: int):
    """Nearest-neighbour resample of a projected layer onto our lon/lat grid (w x h). NaN outside the swath."""
    import numpy as np
    from pyproj import Transformer

    x, y, epsg = grid_of(f, layer)
    lon = BBOX[0] + (np.arange(w) + 0.5) / w * (BBOX[2] - BBOX[0])
    lat = BBOX[3] - (np.arange(h) + 0.5) / h * (BBOX[3] - BBOX[1])
    LON, LAT = np.meshgrid(lon, lat)
    X, Y = Transformer.from_crs(4326, epsg, always_xy=True).transform(LON, LAT)
    col = np.rint((X - x[0]) / (x[1] - x[0])).astype(int)
    row = np.rint((Y - y[0]) / (y[1] - y[0])).astype(int)
    ok = (col >= 0) & (col < len(x)) & (row >= 0) & (row < len(y))
    out = np.full((h, w), np.nan, dtype="float32")
    ds = f[layer]
    r0, r1, c0, c1 = row[ok].min(), row[ok].max() + 1, col[ok].min(), col[ok].max() + 1
    block = ds[r0:r1, c0:c1].astype("float32")  # read only the window we need
    out[ok] = block[row[ok] - r0, col[ok] - c0]
    return out


def when(f, path_hint: str, fallback: str) -> datetime:
    p = find_layer(f, "identification", path_hint)
    if p:
        v = f[p][()]
        v = v.decode() if isinstance(v, bytes) else str(v)
        return datetime.fromisoformat(v[:19])
    m = re.search(r"(\d{8}T\d{6})", fallback)
    if not m:
        raise RuntimeError(f"no acquisition time in {fallback}")
    return datetime.strptime(m.group(1), "%Y%m%dT%H%M%S")


def pair_times(f, name: str) -> tuple[datetime, datetime]:
    """Reference and secondary acquisition times of an offsets product: from metadata, else the file name."""
    got = []
    for hint in ("reference", "secondary"):
        p = find_layer(f, hint, "zeroDopplerStartTime")
        if p:
            v = f[p][()]
            got.append(datetime.fromisoformat((v.decode() if isinstance(v, bytes) else str(v))[:19]))
    if len(got) == 2:
        return got[0], got[1]
    stamps: list[str] = []
    for m in re.findall(r"\d{8}T\d{6}", name):  # start/end per pass; keep the first stamp of each day
        if all(s[:8] != m[:8] for s in stamps):
            stamps.append(m)
    if len(stamps) < 2:
        raise RuntimeError(f"{name}: can't tell the two pass dates; run `inspect` and adjust pair_times()")
    return tuple(datetime.strptime(s, "%Y%m%dT%H%M%S") for s in stamps[:2])  # type: ignore[return-value]


# ---------------------------------------------------------------- build
def cmd_build(a):
    import h5py
    import numpy as np
    from PIL import Image
    from scipy.ndimage import median_filter

    rows = json.loads((RAW / "granules.json").read_text())
    meta = {r["name"]: r for r in rows}
    (OUT / "speed").mkdir(parents=True, exist_ok=True)
    (OUT / "radar").mkdir(parents=True, exist_ok=True)

    # radar previews from GCOV
    passes = {}
    for fp in sorted(RAW.glob("*GCOV*.h5")):
        with h5py.File(fp, "r") as f:
            layer = find_layer(f, "frequencyA", "HHHH") or find_layer(f, "frequencyA", "VVVV")
            if not layer:
                print(f"skip {fp.name}: no HHHH/VVVV layer")
                continue
            t = when(f, "zeroDopplerStartTime", fp.name)
            g0 = sample_to_lonlat(f, layer, RADAR_W, RADAR_H)
        db = 10 * np.log10(np.clip(g0, 1e-6, None))
        img = np.where(np.isnan(g0), 0, np.clip((db + 25) / 25 * 255, 0, 255)).astype("uint8")  # -25..0 dB
        date = t.date().isoformat()
        Image.fromarray(img, "L").save(OUT / "radar" / f"{date}.webp", quality=75)
        m = meta.get(fp.name, {})
        passes[date] = {"date": date, "direction": m.get("direction", "?"), "track": m.get("track"), "frame": m.get("frame"),
                        "radar": f"radar/{date}.webp", "_db": db}
        print(f"radar {date} <- {fp.name}")

    # ice speed from GOFF
    pairs = []
    for fp in sorted(RAW.glob("*GOFF*.h5")):
        with h5py.File(fp, "r") as f:
            az = find_layer(f, "frequencyA", "alongTrackOffset", exclude=("variance", "std"))
            rg = find_layer(f, "frequencyA", "slantRangeOffset", exclude=("variance", "std"))
            snr = find_layer(f, "frequencyA", "snr")
            if not az or not rg:
                print(f"skip {fp.name}: offset layers not found, run `inspect` on it")
                continue
            units = f[az].attrs.get("units", b"meters")
            units = units.decode() if isinstance(units, bytes) else str(units)
            t0, t1 = pair_times(f, fp.name)
            inc_path = find_layer(f, "incidenceAngle")
            inc = float(np.nanmedian(f[inc_path][()])) if inc_path else 37.0
            A = sample_to_lonlat(f, az, GRID_W, GRID_H)
            R = sample_to_lonlat(f, rg, GRID_W, GRID_H)
            S = sample_to_lonlat(f, snr, GRID_W, GRID_H) if snr else None
        if "pixel" in units.lower():
            raise RuntimeError(f"{fp.name}: offsets are in pixels; multiply by the pixel spacing before use")
        days = abs((t1 - t0).total_seconds()) / 86400
        speed = np.hypot(A, R / math.sin(math.radians(inc))) / days
        if S is not None:
            speed[S < 5] = np.nan  # low-correlation offsets are noise
        speed = median_filter(np.nan_to_num(speed, nan=-1), size=3)  # knock out isolated outliers
        ok = (speed >= 0) & (speed < SPEED_MAX * 1.5)
        code = np.clip(np.rint(speed / SPEED_MAX * 255), 1, 255).astype("uint8")
        la = np.dstack([np.where(ok, code, 0), np.where(ok, 255, 0)]).astype("uint8")
        s, e = sorted([t0.date().isoformat(), t1.date().isoformat()])
        name = f"speed/{s}_{e}.png"
        Image.fromarray(la, "LA").save(OUT / name)
        pairs.append({"start": s, "end": e, "days": round(days), "speed": name, "_grid": np.where(ok, speed, np.nan)})
        print(f"speed {s} -> {e} ({days:.1f} d, incidence {inc:.0f}°) <- {fp.name}")

    if not pairs:
        sys.exit("No GOFF pairs were processed, so there is no speed data. Check `search` results and `inspect` output.")
    pairs.sort(key=lambda p: p["start"])

    # probe time series (3x3 mean around each probe)
    def gxy(lon, lat):
        return (int((lon - BBOX[0]) / (BBOX[2] - BBOX[0]) * GRID_W), int((BBOX[3] - lat) / (BBOX[3] - BBOX[1]) * GRID_H))

    series = []
    for p in pairs:
        row = {"start": p["start"], "end": p["end"]}
        for pr in PROBES:
            x, y = gxy(pr["lon"], pr["lat"])
            v = p["_grid"][y - 1:y + 2, x - 1:x + 2]
            row[pr["id"]] = round(float(np.nanmean(v)), 1) if np.isfinite(v).any() else None
        series.append(row)

    # calving front along the flowline: strongest dark->bright step (mélange -> glacier ice) in backscatter
    fl = np.array(FLOWLINE)
    seg = np.hypot(np.diff(fl[:, 0]) * 39.6, np.diff(fl[:, 1]) * 111.2)  # km at ~69 N
    s_km = np.concatenate([[0], np.cumsum(seg)])
    samples = np.linspace(0, s_km[-1], 400)
    lons, lats = np.interp(samples, s_km, fl[:, 0]), np.interp(samples, s_km, fl[:, 1])
    fronts = []
    for date in sorted(passes):
        db = passes[date]["_db"]
        cx = ((lons - BBOX[0]) / (BBOX[2] - BBOX[0]) * RADAR_W).astype(int).clip(0, RADAR_W - 1)
        cy = ((BBOX[3] - lats) / (BBOX[3] - BBOX[1]) * RADAR_H).astype(int).clip(0, RADAR_H - 1)
        prof = np.convolve(np.nan_to_num(db[cy, cx], nan=-30), np.ones(9) / 9, mode="same")
        k = int(np.argmax(np.diff(prof[:200])))  # search the first ~half of the flowline only
        lon0, lat0 = lons[k], lats[k]
        line = [[round(lon0 + 0.002 * math.sin(i), 4), round(lat0 + d, 4)] for i, d in enumerate(np.linspace(-0.03, 0.03, 9))]
        fronts.append({"date": date, "sKm": float(samples[k]), "line": line})
    ref = fronts[0]["sKm"] if fronts else 0
    for fr in fronts:
        fr["advanceKm"] = round(ref - fr.pop("sKm"), 2)  # moving down-flowline (west) = advance

    manifest = {
        "sample": False,
        "glacier": "Sermeq Kujalleq (Jakobshavn Isbræ)",
        "bbox": list(BBOX),
        "basemap": {"src": "basemap.webp", "caption": "Sentinel-2 via NASA HLS, 14 Jul 2025 (NASA GIBS)"},
        "grid": {"width": GRID_W, "height": GRID_H},
        "speedMax": SPEED_MAX,
        "units": "m/day",
        "passes": [{k: v for k, v in p.items() if not k.startswith("_")} for _, p in sorted(passes.items())],
        "pairs": [{k: v for k, v in p.items() if not k.startswith("_")} for p in pairs],
        "probes": PROBES,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (OUT / "timeseries.json").write_text(json.dumps({"sample": False, "units": "m/day", "series": series}, indent=1))
    (OUT / "fronts.json").write_text(json.dumps({"sample": False, "flowline": FLOWLINE, "fronts": fronts}, indent=1))
    print(f"wrote {len(pairs)} speed pairs, {len(passes)} radar passes, {len(fronts)} fronts to {OUT}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("--start", default="2025-10-01")
    s.add_argument("--end", default=datetime.now().date().isoformat())
    s.add_argument("--track", type=int, default=170, help="NISAR track; 0 = all tracks (170/53 D had the longest record in Nov 2026)")
    s.add_argument("--frame", type=int, default=53)
    sub.add_parser("download")
    i = sub.add_parser("inspect")
    i.add_argument("file")
    sub.add_parser("build")
    a = ap.parse_args()
    {"search": cmd_search, "download": cmd_download, "inspect": cmd_inspect, "build": cmd_build}[a.cmd](a)


if __name__ == "__main__":
    main()
