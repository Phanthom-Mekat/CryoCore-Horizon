"""Bounded analysis of a native-grid rectangle; no water classification."""
import math
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import transform
from rasterio.windows import Window, bounds


def area_evidence(root: Path, manifest: dict, lon1: float, lat1: float, lon2: float, lat2: float):
    coords = [(lon1, lat1), (lon2, lat2)]
    if any(not math.isfinite(v) for p in coords for v in p) or any(abs(x) > 180 or abs(y) > 85 for x,y in coords):
        raise ValueError("Invalid coordinates")
    with rasterio.open(root / "before-HHHH.tif") as ref:
        xs, ys = transform("EPSG:4326", ref.crs, [lon1,lon2], [lat1,lat2])
        if not all(math.isfinite(v) for v in xs+ys): raise ValueError("Unprojectable coordinates")
        points = [ref.index(x,y) for x,y in zip(xs,ys)]
        r0,r1 = sorted(p[0] for p in points); c0,c1 = sorted(p[1] for p in points)
        raw = (r0,c0,r1,c1)
        r0,c0,r1,c1 = max(0,r0),max(0,c0),min(ref.height-1,r1),min(ref.width-1,c1)
        if r1 < r0 or c1 < c0: return {"status":"outside_extent", "case_id":manifest["id"], "measurements":[]}
        window = Window(c0,r0,c1-c0+1,r1-r0+1)
        total = int(window.width*window.height)
        if total > 1_000_000: raise ValueError("Selection exceeds analysis limit")
        grid = (ref.crs,ref.transform,ref.shape)
        if not ref.crs.is_projected or ref.crs.linear_units != "metre": raise ValueError("A metre-based projected grid is required")
        pixel_km2 = abs(ref.transform.a*ref.transform.e-ref.transform.b*ref.transform.d)/1e6
        left,bottom,right,top = bounds(window,ref.transform)
        lons,lats = transform(ref.crs,"EPSG:4326",[left,right,right,left,left],[top,top,bottom,bottom,top])
    rows=[]
    for pol in ("HHHH","HVHV"):
        layers={}
        for kind in ("before","after","change","common"):
            with rasterio.open(root / f"{kind}-{pol}.tif") as src:
                if (src.crs,src.transform,src.shape)!=grid: raise ValueError("Raster grids do not match")
                layers[kind]=src.read(1,window=window,masked=True).astype("float64").filled(np.nan)
        valid=(layers["common"]==1)
        for kind in ("before","after","change"): valid &= np.isfinite(layers[kind])
        delta=layers["change"][valid]; n=int(valid.sum())
        edges=[-float("inf"),-6,-4,-2,0,2,4,6,float("inf")]
        counts=np.histogram(delta,bins=edges)[0].tolist()
        rows.append({"polarization":pol[:2],"valid_pixels":n,"excluded_pixels":total-n,
                     "valid_area_km2":n*pixel_km2,"excluded_area_km2":(total-n)*pixel_km2,
                     "before_median_db":float(np.median(layers["before"][valid])) if n else None,
                     "after_median_db":float(np.median(layers["after"][valid])) if n else None,
                     "change_median_db":float(np.median(delta)) if n else None,
                     "change_p05_p95_db":np.percentile(delta,[5,95]).tolist() if n else None,
                     "histogram_counts":counts})
    return {"status":"valid" if any(r["valid_pixels"] for r in rows) else "excluded",
            "case_id":manifest["id"],"method":"native-rectangle-v1", "processing_method":manifest["method"],
            "selection_rule":"Rectangle aligned to native grid, including both clicked pixels; clipped to raster extent. Areas use projected grid cell area.",
            "requested_corners":coords,"clipped_to_extent":raw!=(r0,c0,r1,c1),
            "window":{"row":r0,"column":c0,"height":int(window.height),"width":int(window.width)},
            "selected_pixels":total,"selected_area_km2":total*pixel_km2,
            "geometry":{"type":"Polygon","coordinates":[list(map(list,zip(lons,lats)))]},
            "measurements":rows,"histogram_labels":["< −6","−6 to −4","−4 to −2","−2 to 0","0 to 2","2 to 4","4 to 6","≥ 6"],
            "histogram_note":"Bins include their lower edge and exclude their upper edge; counts include common-valid pixels only. Units: dB.",
            "sources":manifest["sources"],"assets":manifest["assets"],"claim":manifest["claim"],
            "limitations":manifest["limitations"]+["Selection is exploratory, not a detected event or validated finding. Excluded pixels are not unchanged. HH/HV areas overlap; do not add them. Median pixel change is not necessarily the difference of the two date medians."]}
