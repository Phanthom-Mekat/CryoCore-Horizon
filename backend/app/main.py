from contextlib import asynccontextmanager
from datetime import date

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import cases, jobs
from .config import Settings
from .database import LATEST_VERSION, Database
from .explorer import build_explorer
from .nasa import CMR_URL, CatalogError, NasaCatalog
from .region import PRODUCTS, REGION
from .schemas import Product, Region, Scene, ScenePage, SearchRequest, SearchResponse


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
        description="NISAR-first scene discovery, provenance, and frozen case bundles (observed radar change). No synthetic observations.",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/health", tags=["System"])
    def health():
        with database.connect() as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": "sqlite", "schema_version": LATEST_VERSION}

    @app.get("/api/v1/region", response_model=Region, tags=["Study area"])
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
            "status": "Metadata discovery is live. Curated cases are processed offline by the worker and served from frozen bundles.",
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

    @app.get("/api/v1/scenes/{concept_id}", response_model=Scene, tags=["Stored scenes"])
    def scene(concept_id: str):
        result = database.get_scene(concept_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Scene not found in the local catalog.")
        return result

    app.include_router(cases.router(database, settings))
    app.include_router(jobs.router(database, settings))
    return app


app = create_app()
