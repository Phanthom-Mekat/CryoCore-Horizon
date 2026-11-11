from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .database import Database
from .nasa import CMR_URL, CatalogError, NasaCatalog
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
        description="NISAR-first scene discovery and provenance. No synthetic observations or computed change products.",
        lifespan=lifespan,
    )
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/health", tags=["System"])
    def health():
        with database.connect() as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": "sqlite", "schema_version": 1}

    @app.get("/api/v1/region", tags=["Study area"])
    def region():
        return REGION

    @app.get("/api/v1/sources", tags=["NASA data"])
    def sources():
        return {
            "primary": {"mission": "NASA-ISRO NISAR", "catalog": CMR_URL,
                        "distributor": "ASF DAAC", "products": PRODUCTS,
                        "documentation": "https://nisar-docs.asf.alaska.edu/"},
            "status": "Metadata discovery only; raster downloads and analysis are not implemented.",
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

    return app


app = create_app()
