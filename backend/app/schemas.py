from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Product = Literal["GCOV", "GUNW", "GOFF"]


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: date
    end_date: date
    product: Product = "GCOV"
    page_size: int = Field(default=25, ge=1, le=100)
    page: int = Field(default=1, ge=1, le=10000)

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class Scene(BaseModel):
    concept_id: str
    revision_id: int
    granule_id: str
    collection: str
    product: Product
    start_time: str | None
    end_time: str | None
    urls: list[dict]
    spatial_extent: dict
    metadata: dict
    retrieved_at: str
    source: str = "NASA Earthdata CMR / ASF DAAC"
    mission: str = "NASA-ISRO NISAR"
    sample: bool = False


class SearchResponse(BaseModel):
    search_id: int
    region_id: str
    total_hits: int
    page: int
    page_size: int
    has_more: bool
    scenes: list[Scene]


class ScenePage(BaseModel):
    total: int
    limit: int
    offset: int
    scenes: list[Scene]
