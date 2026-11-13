"""How the published change result depends on the ±dB threshold (Gate C: threshold sensitivity)."""

import numpy as np
from scipy import ndimage

from . import change

THRESHOLDS_DB = (2.0, 3.0, 4.0, 5.0, 6.0)


def sweep(delta: np.ndarray, published: dict, listed: list, p: dict, min_px: int, pixel_km2: float) -> dict:
    """Rerun only the region step at each tested threshold, over the same change values, opening and minimum size.

    published: {kind: (labels, counts)} at p["threshold_db"]; listed: [(finding id, kind, label)] from findings.build.
    A listed finding counts as present at a threshold when its published region overlaps a region found there.
    """
    boxes = {kind: ndimage.find_objects(labels) for kind, (labels, _) in published.items()}
    rows, highest = [], {}  # every listed finding is present at the published threshold, so all get a value
    for t in sorted({*THRESHOLDS_DB, float(p["threshold_db"])}):
        regions = published if t == p["threshold_db"] else {
            kind: change.regions(delta, sign, t, p["opening_px"], min_px) for kind, sign in change.SIGNS}
        present = 0
        for fid, kind, lab in listed:
            sl = boxes[kind][lab - 1]
            if (regions[kind][0][sl][published[kind][0][sl] == lab] > 0).any():
                present += 1
                highest[fid] = t  # thresholds ascend, so this ends at the highest one passed
        row = {"threshold_db": t}
        for kind, _ in change.SIGNS:
            row[f"{kind}_km2"] = round(int(regions[kind][1].sum()) * pixel_km2, 4)  # same rounding as metrics
            row[f"{kind}_regions"] = len(regions[kind][1])
        rows.append({**row, "listed_findings_present": present})
    return {
        "units": "dB",
        "published_threshold_db": float(p["threshold_db"]),
        "note": "Same valid pixels, speckle filter, opening and minimum region area as the published run; only the "
                "threshold changes. highest_threshold_by_finding: the highest tested threshold at which each listed "
                "finding still appears.",
        "rows": rows,
        "highest_threshold_by_finding": highest,
    }
