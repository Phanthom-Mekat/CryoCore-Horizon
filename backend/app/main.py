from contextlib import asynccontextmanager
from datetime import date

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from functools import lru_cache

from .config import BACKEND_ROOT, Settings
from .cases import list_cases, read_case
from .display import preview
from .sampling import sample_case
from .brief import processed_brief, brief_csv
from .areas import area_evidence
from typing import Literal
from .database import Database
from .explorer import build_explorer
from .nasa import CMR_URL, CatalogError, NasaCatalog
from .pairs import assess_pair
from .region import PRODUCTS, REGION
from .schemas import Product, Scene, ScenePage, SearchRequest, SearchResponse


def create_app(settings: Settings | None = None, transport: httpx.BaseTransport | None = None):
    settings = settings or Settings()
    database = Database(settings.resolved_database_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.initialize()
        with httpx.Client(base_url=CMR_URL, timeout=settings.nasa_timeout_seconds,
                          transport=transport, headers={"User-Agent": "CryoCore-Horizon/0.1"}) as client:
            app.state.catalog = NasaCatalog(client)
            yield

    app = FastAPI(
        title="CryoCore Horizon — Chattogram API", version="0.1.0",
        description="NISAR-first discovery, provenance and experimental calibrated radar-change pilots. No validated flood classification.",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/health", tags=["System"])
    def health():
        with database.connect() as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": "sqlite", "schema_version": 3}

    @app.get("/api/v1/region", tags=["Study area"])
    def region():
        return REGION

    @app.get("/api/v1/explorer", tags=["Study area"])
    def explorer(product: Product = "GCOV", start_date: date | None = None, end_date: date | None = None):
        if start_date and end_date and start_date > end_date:
            raise HTTPException(status_code=422, detail="end_date must be on or after start_date")
        clause, args = "product = ?", [product]
        if start_date:
            clause += " AND substr(start_time, 1, 10) >= ?"
            args.append(start_date.isoformat())
        if end_date:
            clause += " AND substr(start_time, 1, 10) <= ?"
            args.append(end_date.isoformat())
        with database.connect() as db:
            rows = db.execute(f"SELECT payload FROM scenes WHERE {clause} ORDER BY start_time DESC, concept_id", args).fetchall()
        return build_explorer(rows)

    @app.get("/api/v1/sources", tags=["NASA data"])
    def sources():
        return {
            "primary": {"mission": "NASA-ISRO NISAR", "catalog": CMR_URL,
                        "distributor": "ASF DAAC", "products": PRODUCTS,
                        "documentation": "https://nisar-docs.asf.alaska.edu/"},
            "status": "CMR discovery, authenticated preparation and experimental frequency-A calibrated radar-change pilot. No validated flood classification.",
            "download_authentication": "Protected data downloads require NASA Earthdata Login.",
        }

    @app.post("/api/v1/nasa/search", response_model=SearchResponse, tags=["NASA data"])
    def search(query: SearchRequest):
        try:
            scenes, hits, now = app.state.catalog.search(query)
        except CatalogError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        search_id = database.save_search(query, scenes, hits, now)
        return SearchResponse(search_id=search_id, region_id=REGION["id"], total_hits=hits,
                              page=query.page, page_size=query.page_size,
                              has_more=query.page * query.page_size < hits, scenes=scenes)

    @app.get("/api/v1/scenes", response_model=ScenePage, tags=["Stored scenes"])
    def scenes(product: Product | None = None, limit: int = Query(25, ge=1, le=100),
               offset: int = Query(0, ge=0)):
        return database.list_scenes(product, limit, offset)

    @app.get("/api/v1/cases", tags=["Processed pilots"])
    def cases():
        return {"cases": list_cases(BACKEND_ROOT / "data" / "cases")}

    @app.get("/api/v1/cases/{case_id}", tags=["Processed pilots"])
    def case(case_id: str):
        result = read_case(BACKEND_ROOT / "data" / "cases", case_id)
        if result is None: raise HTTPException(status_code=404, detail="Published case not found.")
        return result

    @app.get("/api/v1/cases/{case_id}/area", tags=["Processed pilots"])
    def case_area(case_id: str, lon1: float = Query(ge=-180, le=180, allow_inf_nan=False),
                  lat1: float = Query(ge=-85, le=85, allow_inf_nan=False),
                  lon2: float = Query(ge=-180, le=180, allow_inf_nan=False),
                  lat2: float = Query(ge=-85, le=85, allow_inf_nan=False)):
        manifest = case(case_id)
        try:
            return area_evidence(BACKEND_ROOT / "data" / "cases" / case_id, manifest, lon1, lat1, lon2, lat2)
        except (OSError, ValueError):
            raise HTTPException(422, "The selected area cannot be analysed on this published grid.") from None

    @app.get("/api/v1/cases/{case_id}/brief", tags=["Processed pilots"])
    def case_brief(case_id: str, format: Literal["json", "csv"] = "json"):
        report = processed_brief(case(case_id))
        if format == "csv":
            return Response(brief_csv(report), media_type="text/csv",
                            headers={"Content-Disposition": f'attachment; filename="radar-brief-{case_id}.csv"'})
        return report

    @app.get("/api/v1/cases/{case_id}/sample", tags=["Processed pilots"])
    def case_sample(case_id: str, longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
                    latitude: float = Query(ge=-90, le=90, allow_inf_nan=False)):
        manifest = case(case_id)
        try:
            return sample_case(BACKEND_ROOT / "data" / "cases" / case_id, manifest, longitude, latitude)
        except (OSError, ValueError):
            raise HTTPException(status_code=422, detail="The location or published raster grid could not be sampled.") from None

    @lru_cache(maxsize=24)
    def cached_preview(case_id: str, name: str, digest: str):
        return preview(BACKEND_ROOT / "data" / "cases" / case_id / name, name.startswith("change-"))

    @app.get("/api/v1/cases/{case_id}/display/{name}", tags=["Processed pilots"])
    def case_display(case_id: str, name: str, bounds: bool = False):
        result = case(case_id)
        asset = next((a for a in result["assets"] if a["name"] == name and a["units"] == "dB"), None)
        if asset is None or "/" in name or "\\" in name:
            raise HTTPException(status_code=404, detail="Display layer not found.")
        try:
            png, corners = cached_preview(case_id, name, asset["sha256"])
        except OSError:
            raise HTTPException(status_code=404, detail="Display asset unavailable.") from None
        if bounds:
            return {"corners": corners, "scale": [-6,6] if name.startswith("change-") else [-25,0], "units": "dB"}
        return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})

    @app.get("/api/v1/cases/{case_id}/assets/{name}", tags=["Processed pilots"])
    def case_asset(case_id: str, name: str):
        result = case(case_id)
        if name not in {a["name"] for a in result["assets"]} or "/" in name or "\\" in name:
            raise HTTPException(status_code=404, detail="Published asset not found.")
        path = BACKEND_ROOT / "data" / "cases" / case_id / name
        if not path.is_file(): raise HTTPException(status_code=404, detail="Published asset not found.")
        return FileResponse(path, media_type="image/tiff", filename=name)

    @app.get("/api/v1/pairs/assess", tags=["NASA data"])
    def pair_assessment(before: str, after: str):
        first, second = database.get_scene(before), database.get_scene(after)
        if first is None or second is None:
            raise HTTPException(status_code=404, detail="Both scenes must exist in the local catalog.")
        return assess_pair(first, second, database.get_inspection(before, first["revision_id"]),
                           database.get_inspection(after, second["revision_id"]))

    @app.get("/api/v1/scenes/{concept_id}/downloads", tags=["NASA data"])
    def downloads(concept_id: str):
        scene = database.get_scene(concept_id)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene not found in the local catalog.")
        return {"concept_id": concept_id, "revision_id": scene["revision_id"],
                "downloads": database.scene_downloads(concept_id, scene["revision_id"])}

    @app.get("/api/v1/scenes/{concept_id}/inspection", tags=["NASA data"])
    def inspection(concept_id: str):
        scene = database.get_scene(concept_id)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene not found in the local catalog.")
        report = database.get_inspection(concept_id, scene["revision_id"])
        return report or {"concept_id": concept_id, "revision_id": scene["revision_id"],
                          "status": "not_inspected", "analysis_ready": False}

    @app.get("/api/v1/scenes/{concept_id}", response_model=Scene, tags=["Stored scenes"])
    def scene(concept_id: str):
        result = database.get_scene(concept_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Scene not found in the local catalog.")
        return result

    return app


app = create_app()
