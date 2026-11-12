"""Two kinds of case bundle under data/cases/, told apart by their id.

Published pilots (24-hex ids, GeoTIFF bundles written by app.subset): `read_case` / `list_cases`, served by
app.main at /api/v1/cases. Staging output is never discoverable.

Curated cases (slug ids, definitions in a committed asset, PNG layers + findings written by the worker): the router
below, at /api/v1/curated-cases. Every GET reads only SQLite and data/cases/<id>/, never NASA, so a recorded demo
replays offline. A bundle counts as published only once its directory exists with manifest.json (the worker swaps
it in atomically).
"""
import csv
import io
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from .config import Settings
from .database import Database, now_iso
from .explorer import ASSETS
from .jobs import latest_for_case
from .schemas import CaseDetail, CaseSummary, FindingCollection, FindingDetail, Layer, Timeseries

DEFINITIONS = ASSETS / "analysis-areas.geojson"
REQUIRED_FILES = ("manifest.json", "before_db.png", "after_db.png", "change_db.png", "findings.geojson", "timeseries.json")
ASSET_NAME = re.compile(r"[a-z][a-z0-9_]{0,63}\.png")
CACHE = "public, max-age=31536000, immutable"  # URLs carry ?v=<job id>, so a republished bundle gets new URLs
SYNTHETIC_NOTICE = "SYNTHETIC QA DATA - NOT NISAR. Made from generated test fixtures to exercise the pipeline; no value is an observation."
FINDING_COLUMNS = ("id", "kind", "label", "area_km2", "mean_delta_db", "median_before_db", "median_after_db",
                   "valid_fraction", "quality", "quality_reason")


def definitions() -> dict[str, dict]:
    if not DEFINITIONS.exists():
        return {}
    return {f["properties"]["id"]: f for f in json.loads(DEFINITIONS.read_text(encoding="utf-8"))["features"]}


def seed_definitions(db):
    """Upsert the committed case definitions into regions/cases. Idempotent."""
    for case_id, feature in definitions().items():
        p = feature["properties"]
        db.execute("""INSERT INTO regions VALUES (?, ?, 'analysis_area', ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET name=excluded.name, geometry=excluded.geometry,
                      provenance=excluded.provenance""",
                   (case_id, p["place"], json.dumps(feature["geometry"]), p["provenance"], now_iso()))
        db.execute("""INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET title=excluded.title, place=excluded.place,
                      stack=excluded.stack, before_concept_id=excluded.before_concept_id,
                      after_concept_id=excluded.after_concept_id, definition=excluded.definition""",
                   (case_id, case_id, p["title"], p["place"], p["stack"], p["before"]["concept_id"],
                    p["after"]["concept_id"], json.dumps(feature), now_iso()))


def bundle_dir(settings: Settings, case_id: str) -> Path:
    return settings.resolved_data_dir / "cases" / case_id


def source_info(scene: dict) -> dict:
    """Provenance of one stored CMR scene, in the public SourceRef shape (no local paths)."""
    umm = scene["metadata"]["umm"]
    attrs = {a["Name"]: a.get("Values", []) for a in umm.get("AdditionalAttributes", [])}
    files = umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
    h5 = next((f for f in files if f.get("Name", "").endswith(".h5") and "QA" not in f["Name"]), {})
    checksum = h5.get("Checksum") or {}
    return {"granule": scene["granule_id"], "concept_id": scene["concept_id"], "collection": scene["collection"],
            "version": (attrs.get("PRODUCT_VERSION") or [None])[0],
            "md5": checksum.get("Value") if checksum.get("Algorithm") == "MD5" else None,
            "size_bytes": h5.get("SizeInBytes"),
            "qa_url": next((u["URL"] for u in scene["urls"] if u.get("URL", "").endswith("_QA_REPORT.pdf")), None)}


def router(database: Database, settings: Settings) -> APIRouter:
    api = APIRouter(prefix="/api/v1", tags=["Cases"])

    def manifest(case_id: str) -> dict | None:
        """The published bundle's manifest. Every case read goes through here, so a bundle made from synthetic test
        fixtures is never served (treated as not published) unless CRYO_ALLOW_SYNTHETIC_QA=1."""
        path = bundle_dir(settings, case_id) / "manifest.json"
        found = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
        if found and found.get("synthetic_fixture") and not settings.allow_synthetic_qa:
            return None
        return found

    def bundle_json(case_id: str, name: str):
        return json.loads((bundle_dir(settings, case_id) / name).read_text(encoding="utf-8"))

    def summary(db, row) -> tuple[dict, dict | None, dict | None]:
        feature = json.loads(row["definition"])
        p = feature["properties"]
        found, job = manifest(row["id"]), latest_for_case(db, row["id"])
        if found:
            status = "ready"  # a published bundle stays servable while a reprocessing job runs or fails
        elif job is None or job["state"] in ("succeeded", "cancelled"):
            status = "not_processed"
        elif job["state"] == "failed":
            status = "needs_credentials" if job["error_code"] == "needs_credentials" else "failed"
        else:
            status = job["state"]
        times = [row["updated_at"], found and found.get("published_at"), job and (job["heartbeat_at"] or job["created_at"])]
        area = {"type": "Feature", "geometry": feature["geometry"],
                "properties": {"id": p["id"], "name": p["title"], "provenance": p["provenance"],
                               "provenance_note": p.get("provenance_note")}}
        return ({"id": row["id"], "title": row["title"], "place": row["place"], "status": status, "stack": row["stack"],
                 "before": p["before"], "after": p["after"], "analysis_area": area,
                 "updated_at": max(t for t in times if t),
                 "synthetic_fixture": bool(found and found.get("synthetic_fixture"))}, found, job)

    def case_row(db, case_id: str):
        row = db.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Unknown case.")
        return row

    def detail(case_id: str) -> dict:
        with database.connect() as db:
            base, found, job = summary(db, case_row(db, case_id))
            sources = (found or {}).get("sources")
            if not sources:  # not processed yet: provenance from the local catalog (still no NASA call)
                sources = []
                for key in ("before", "after"):
                    r = db.execute("SELECT payload FROM scenes WHERE concept_id = ?", (base[key]["concept_id"],)).fetchone()
                    sources.append(source_info(json.loads(r["payload"])) if r else
                                   {"granule": base[key]["granule"], "concept_id": base[key]["concept_id"], "collection": None,
                                    "version": None, "md5": None, "size_bytes": None, "qa_url": None})
        return {**base, "method": (found or {}).get("method"), "metrics": (found or {}).get("metrics"),
                "caveats": (found or {}).get("caveats") or [
                    "Not processed yet: no calibrated layers, change values or findings exist for this case.",
                    "Any difference between browse quicklooks is observed radar change, not measured water change."],
                "sources": sources,
                "job": job and {k: job[k] for k in ("id", "state", "stage", "progress", "error", "retryable")}}

    def ready(case_id: str) -> dict | None:
        with database.connect() as db:
            case_row(db, case_id)
        return manifest(case_id)

    @api.get("/curated-cases", response_model=list[CaseSummary])
    def cases():
        with database.connect() as db:
            return [summary(db, row)[0] for row in db.execute("SELECT * FROM cases ORDER BY id").fetchall()]

    @api.get("/curated-cases/{case_id}", response_model=CaseDetail)
    def case(case_id: str):
        return detail(case_id)

    @api.get("/curated-cases/{case_id}/layers", response_model=list[Layer])
    def layers(case_id: str):
        found = ready(case_id)
        if not found:
            return []
        version = found.get("job_id") or found.get("published_at", "")
        return [{**{k: v for k, v in layer.items() if k != "file"},
                 "url": f"/api/v1/curated-cases/{case_id}/assets/{layer.get('file') or layer['id'] + '.png'}?v={version}"}
                for layer in found.get("layers", [])]

    @api.get("/curated-cases/{case_id}/assets/{name}", response_class=FileResponse, responses={200: {"content": {"image/png": {}}}})
    def asset(case_id: str, name: str):
        if not ASSET_NAME.fullmatch(name):
            raise HTTPException(status_code=404, detail="Asset not found.")
        if not ready(case_id):
            raise HTTPException(status_code=404, detail="Case not processed yet.")
        path = bundle_dir(settings, case_id) / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Asset not found.")
        return FileResponse(path, media_type="image/png", headers={"Cache-Control": CACHE})

    @api.get("/curated-cases/{case_id}/findings", response_model=FindingCollection)
    def findings(case_id: str):
        if not ready(case_id):
            return {"type": "FeatureCollection", "features": []}
        return bundle_json(case_id, "findings.geojson")

    @api.get("/curated-cases/{case_id}/timeseries", response_model=Timeseries)
    def timeseries(case_id: str):
        if not ready(case_id):
            return {"units": "dB", "points": []}
        return bundle_json(case_id, "timeseries.json")

    @api.get("/findings/{finding_id}", response_model=FindingDetail, tags=["Cases"])
    def finding(finding_id: str):
        with database.connect() as db:
            ids = [r["id"] for r in db.execute("SELECT id FROM cases ORDER BY id")]
        for case_id in ids:
            found = manifest(case_id)
            if not found:
                continue
            feature = next((f for f in bundle_json(case_id, "findings.geojson")["features"]
                            if str(f["properties"]["id"]) == finding_id), None)
            if feature is None:
                continue
            with database.connect() as db:
                checks = [{k: r[k] for k in ("reference_source", "observed_at", "label", "notes", "created_at")}
                          for r in db.execute("SELECT * FROM validation_records WHERE case_id = ? AND finding_id = ? ORDER BY id",
                                              (case_id, finding_id))]
            method = found.get("method") or {}
            return {**feature, "case_id": case_id, "evidence": {
                "sources": found.get("sources", []), "params": method.get("params", {}),
                "method_version": method.get("version"), "reference_checks": checks}}
        raise HTTPException(status_code=404, detail="Finding not found.")

    @api.get("/curated-cases/{case_id}/export", tags=["Cases"], responses={200: {"content": {
        "application/json": {}, "text/csv": {}, "application/geo+json": {}}}})
    def export(case_id: str, format: str = Query("json", pattern="^(json|csv|geojson)$")):
        info = detail(case_id)
        if info["status"] != "ready":
            raise HTTPException(status_code=409, detail="Case not processed yet; nothing to export.")
        found = manifest(case_id)
        fc = bundle_json(case_id, "findings.geojson")
        provenance = {
            "case_id": case_id, "exported_at": now_iso(), "published_at": found.get("published_at"),
            "method": info["method"], "sources": info["sources"],
            "analysis_area_provenance": info["analysis_area"]["properties"]["provenance"],
            "synthetic_fixture": info["synthetic_fixture"],
            "notice": SYNTHETIC_NOTICE if info["synthetic_fixture"] else
                      "Observed radar backscatter change from NASA-ISRO NISAR GCOV. Not validated as flood, "
                      "water or damage; see caveats.",
            "caveats": info["caveats"], "attribution": "NASA-ISRO NISAR data via NASA Earthdata / ASF DAAC",
        }
        name = f"{case_id}-{(found.get('published_at') or '')[:10]}"
        if format == "geojson":
            body, media = json.dumps({**fc, "provenance": provenance}, indent=2), "application/geo+json"
        elif format == "csv":
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow([*FINDING_COLUMNS, "case_id", "before_granule", "after_granule", "method_version",
                             "synthetic_fixture"])
            for f in fc["features"]:
                writer.writerow([*(f["properties"].get(c) for c in FINDING_COLUMNS), case_id, info["before"]["granule"],
                                 info["after"]["granule"], (info["method"] or {}).get("version"), info["synthetic_fixture"]])
            body, media = out.getvalue(), "text/csv"
        else:
            body = json.dumps({"case": info, "findings": fc, "timeseries": bundle_json(case_id, "timeseries.json"),
                               "provenance": provenance}, indent=2)
            media = "application/json"
        return Response(body, media_type=media,
                        headers={"Content-Disposition": f'attachment; filename="{name}.{format}"'})

    return api


def read_case(root: Path, case_id: str):
    if not re.fullmatch(r"[a-f0-9]{24}", case_id): return None
    path = root / case_id / "manifest.json"
    if not path.is_file(): return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_cases(root: Path):
    if not root.exists(): return []
    return [case for child in sorted(root.iterdir()) if (case := read_case(root, child.name)) is not None]
