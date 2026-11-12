"""Export published measurements without inventing findings or recomputing pixels."""
import csv
import io


def processed_brief(manifest: dict):
    rows = []
    for pol in ("HHHH", "HVHV"):
        s = manifest["statistics"][pol]
        rows.append({"polarization": pol[:2], "common_area_km2": s["common_area_km2"],
                     "common_valid_pixels": s["common_valid_pixels"],
                     "geographic_exclusion_km2": s["outside_roi_area_km2"],
                     "quality_excluded_pixels": s["excluded_pixels"],
                     "median_change_db": s["median_change_db"],
                     "p05_change_db": s["change_percentiles_db"][0],
                     "p95_change_db": s["change_percentiles_db"][2]})
    return {"schema_version": "processed-observation-brief/1", "case_id": manifest["id"],
            "title": manifest["title"], "processed_utc": manifest["created_at"],
            "method": manifest["method"], "claim": manifest["claim"],
            "change_definition": "After minus before calibrated backscatter in dB; common-valid pixels only.",
            "distribution_note": "P05–P95 describes the middle 90% of pixel changes, not a confidence interval. HH and HV observe the same area; do not add their coverage.",
            "validation_status": "Experimental; no independent dated reference validation or water classification.",
            "measurements": rows, "sources": manifest["sources"],
            "grid": {k: manifest[k] for k in ("crs", "bounds", "transform")},
            "validity_rule": manifest["validity_rule"], "alignment": manifest["alignment"],
            "boundary": manifest["inputs"]["boundary"], "limitations": manifest["limitations"],
            "assets": manifest["assets"],
            "attribution": "NASA–ISRO NISAR; distributed by ASF DAAC; discovery via NASA Earthdata CMR."}


def brief_csv(brief: dict):
    rows = [{"case_id": brief["case_id"], "method": brief["method"],
             "before_concept_id": brief["sources"][0]["concept_id"],
             "before_acquired_utc": brief["sources"][0]["acquisition"],
             "after_concept_id": brief["sources"][1]["concept_id"],
             "after_acquired_utc": brief["sources"][1]["acquisition"],
             **row, "claim": brief["claim"], "validation_status": brief["validation_status"],
             "distribution_note": brief["distribution_note"],
             "limitations": " | ".join(brief["limitations"])} for row in brief["measurements"]]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()
