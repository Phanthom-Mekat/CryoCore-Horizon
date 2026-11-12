"""Conservative metadata gate. Passing never asserts valid pixel coverage."""
from .explorer import boundary, footprint


def assess_pair(before, after, before_report, after_report):
    reasons = []
    if before["concept_id"] == after["concept_id"] or not before.get("start_time") or not after.get("start_time") or before["start_time"] >= after["start_time"]:
        reasons.append("Select distinct acquisitions in chronological order.")
    if not before.get("collection") or before.get("collection") != after.get("collection"):
        reasons.append("Collection/maturity differs.")
    attributes = [{v["Name"]: v.get("Values", []) for v in s.get("metadata", {}).get("umm", {}).get("AdditionalAttributes", [])} for s in (before, after)]
    for key in ("PRODUCTION_PIPELINE", "FREQUENCIES"):
        if not attributes[0].get(key) or attributes[0].get(key) != attributes[1].get(key):
            reasons.append(f"Missing or differing catalog {key}.")
    shapes = [footprint(s.get("spatial_extent", {})) for s in (before, after)]
    if any(s is None for s in shapes) or shapes[0].intersection(shapes[1]).intersection(boundary()[0]).area <= 0:
        reasons.append("No verified footprint overlap inside the study boundary.")
    result = {"before": before["concept_id"], "after": after["concept_id"],
              "analysis_ready": False, "reasons": reasons, "frequencies": {},
              "limitations": ["Metadata gate only; masks, valid common pixels, calibration and reference observations still need evaluation."]}
    if not before_report or not after_report:
        reasons.append("Both current scene revisions must be inspected first.")
        result["status"] = "needs_inspection"
        return result
    a, b = before_report["identification"], after_report["identification"]
    for key in ("trackNumber", "frameNumber", "orbitPassDirection", "lookDirection", "productType", "productVersion", "productSpecificationVersion", "radarBand"):
        if a.get(key) is None or a.get(key) != b.get(key): reasons.append(f"Missing or differing {key}.")
    for frequency in sorted(set(before_report["frequencies"]) | set(after_report["frequencies"])):
        left = before_report["frequencies"].get(frequency, {})
        right = after_report["frequencies"].get(frequency, {})
        issues = []
        key = f"FREQUENCY_{frequency[-1]}_RANGE_BANDWIDTH"
        if not attributes[0].get(key) or attributes[0].get(key) != attributes[1].get(key):
            issues.append("Missing or differing catalog acquisition bandwidth.")
        for key in ("projection", "xCoordinateSpacing", "yCoordinateSpacing", "listOfPolarizations"):
            value = left.get(key, {}).get("value")
            if value is None or value != right.get(key, {}).get("value"): issues.append(f"Missing or differing {key}.")
        for key in ("xCoordinates", "yCoordinates"):
            if not left.get(key, {}).get("endpoints") or left.get(key) != right.get(key):
                issues.append(f"{key} requires grid alignment or further inspection.")
        for label, layers in (("before", left), ("after", right)):
            shape = layers.get("HHHH", {}).get("shape")
            for key in ("HHHH", "HVHV", "mask", "inputDataExceptionMask"):
                if not shape or len(shape) != 2 or layers.get(key, {}).get("shape") != shape:
                    issues.append(f"{label} {key} is missing or has incompatible dimensions.")
        result["frequencies"][frequency] = {"metadata_compatible": not reasons and not issues, "issues": issues}
    result["status"] = "metadata_compatible" if any(f["metadata_compatible"] for f in result["frequencies"].values()) else "blocked"
    if a.get("isMixedMode") == "True" or b.get("isMixedMode") == "True":
        result["limitations"].append("Mixed-mode flag is set; inspect processing metadata and valid coverage before analysis.")
    return result
