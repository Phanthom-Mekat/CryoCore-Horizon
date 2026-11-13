"""Plain-language reading of a before/after pair: every change region gets one everyday category from HH and HV.

These are L-band rules of thumb, not a validated classifier; each category is a *likely* reading that the UI states
with its reason, and nothing here confirms flooding, crops or damage. It reads whole regions (the same cleaned
HH change regions as the findings), using their median values: single pixels are too noisy in HV to read alone.

Checked on karnaphuli-estuary (18 Jun vs 16 Oct 2026): with HV <= -19 dB as "water-like" the largest dark area is
16.7 km², the surveyed Karnaphuli channel; 75 of the 86 brighter regions (4.5 km²) brighten in HH and HV together,
mostly fields that were water-like in June: the signature of paddy rice planted into flooded fields and grown by October.
"""

import numpy as np
from scipy import ndimage

from . import change

VERSION = "0.1.0"
WATER_HV_DB = -19.0  # HV this dark: open water at L-band (little volume scattering)
OBJECT_HH_DB = 3.0  # region median HH this bright on the date it is present: metal, ships, buildings, cranes
PLANTS_HV_DB = 1.5  # region median HV change that, with the HH change, reads as more or fewer plants

# code, id, RGBA. Codes are the PNG's identity, so never renumber. Hues checked with the dataviz validator
# (blue/amber/green/red/purple pass in both modes, with the legend and tap answer as the secondary cue);
# "surface" is neutral grey; "water" (both dates) is faint, for orientation only.
CATEGORIES = (
    (1, "water", (0x39, 0x87, 0xE5, 90)),
    (2, "object", (0x83, 0x44, 0xA8, 235)),
    (3, "water_came", (0x39, 0x87, 0xE5, 235)),
    (4, "water_went", (0xC9, 0x85, 0x00, 235)),
    (5, "plants_grew", (0x19, 0x9E, 0x70, 235)),
    (6, "plants_lost", (0xE3, 0x49, 0x48, 235)),
    (7, "surface", (0x8A, 0x8F, 0x98, 235)),
)
CODE = {cid: code for code, cid, _ in CATEGORIES}
RULES = {
    "water": f"no change region; HV <= {WATER_HV_DB:g} dB on both dates",
    "object": f"region median HH >= {OBJECT_HH_DB:g} dB on the date it is brighter",
    "water_came": f"darker region; median HV above {WATER_HV_DB:g} dB before and at or below it after",
    "water_went": f"brighter region; median HV at or below {WATER_HV_DB:g} dB before and above it after, "
                  f"HV rose less than {PLANTS_HV_DB:g} dB",
    "plants_grew": f"brighter region; median HV rose by at least {PLANTS_HV_DB:g} dB",
    "plants_lost": f"darker region; median HV fell by at least {PLANTS_HV_DB:g} dB",
    "surface": "change region that fits none of the above",
}


def read_region(kind: str, hh_b: float, hh_a: float, hv_b: float, hv_a: float) -> str:
    """Category id of one change region from its median dB values (first matching rule wins)."""
    d_hv = hv_a - hv_b
    if kind == "increase":
        if hh_a >= OBJECT_HH_DB:
            return "object"
        if d_hv >= PLANTS_HV_DB:
            return "plants_grew"
        if hv_b <= WATER_HV_DB < hv_a:
            return "water_went"
    else:
        if hv_a <= WATER_HV_DB < hv_b:
            return "water_came"
        if hh_b >= OBJECT_HH_DB:
            return "object"
        if d_hv <= -PLANTS_HV_DB:
            return "plants_lost"
    return "surface"


def classify(regions: dict, hh_b, hh_a, hv_b, hv_a, common, opening_px: int, min_px: int):
    """regions: {kind: (labels, counts)} from change.regions. Returns (uint8 codes, {kind: [category id per label]}).

    Change regions are painted with their category; outside them, water on both dates is painted for orientation
    (cleaned like the regions). 0 = no clear change, or not valid."""
    codes = np.zeros(common.shape, np.uint8)
    in_region = np.zeros(common.shape, bool)
    read = {}
    for kind, (labels, _) in regions.items():
        read[kind] = []
        for lab, sl in enumerate(ndimage.find_objects(labels), start=1):
            region = (labels[sl] == lab) & np.isfinite(hv_b[sl]) & np.isfinite(hv_a[sl])
            meds = [float(np.median(x[sl][region])) for x in (hh_b, hh_a, hv_b, hv_a)] if region.any() else None
            cid = read_region(kind, *meds) if meds else "surface"
            read[kind].append(cid)
            codes[sl][labels[sl] == lab] = CODE[cid]
            in_region[sl] |= labels[sl] == lab
    with np.errstate(invalid="ignore"):
        water = common & ~in_region & (hv_b <= WATER_HV_DB) & (hv_a <= WATER_HV_DB)
    codes[change.clean(water, opening_px, min_px)[0] > 0] = CODE["water"]
    return codes, read


def summary(codes: np.ndarray, pixel_km2: float) -> list[dict]:
    counts = np.bincount(codes.ravel(), minlength=len(CATEGORIES) + 1)
    return [{"code": code, "id": cid, "color": "#{:02x}{:02x}{:02x}".format(*rgba[:3]), "rule": RULES[cid],
             "area_km2": round(int(counts[code]) * pixel_km2, 4)} for code, cid, rgba in CATEGORIES]


def rgba(codes_on_display: np.ndarray) -> np.ndarray:
    """codes (already warped to the display grid, nearest) to RGBA; 0 and NaN are transparent."""
    lut = np.zeros((256, 4), np.uint8)
    for code, _, colour in CATEGORIES:
        lut[code] = colour
    return lut[np.nan_to_num(codes_on_display, nan=0).astype(np.uint8)]
