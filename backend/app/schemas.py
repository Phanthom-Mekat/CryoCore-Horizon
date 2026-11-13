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


class Region(BaseModel):
    id: str
    name: str
    country: str
    bbox: list[float]
    crs: str
    boundary_type: str
    boundary_note: str
    research_themes: list[str]
    primary_mission: str


# --- Curated cases (frozen bundles) and processing jobs ---------------------------------------------------------

CaseStatus = Literal["ready", "not_processed", "queued", "running", "failed", "needs_credentials"]
JobState = Literal["queued", "running", "succeeded", "failed", "cancelled"]


class GranuleRef(BaseModel):
    granule: str
    concept_id: str
    date: str


class CaseSummary(BaseModel):
    id: str
    title: str
    place: str
    status: CaseStatus
    stack: str
    before: GranuleRef
    after: GranuleRef
    analysis_area: dict = Field(description="GeoJSON Feature (Polygon, EPSG:4326); properties.provenance")
    updated_at: str
    synthetic_fixture: bool = Field(default=False, description="True only for a QA bundle made from synthetic test "
                                    "fixtures, served only with CRYO_ALLOW_SYNTHETIC_QA=1. Never NISAR data.")


class Method(BaseModel):
    name: str
    version: str
    params: dict


class Metrics(BaseModel):
    analysis_km2: float
    valid_common_km2: float
    excluded_km2: float
    increase_km2: float
    decrease_km2: float
    threshold_db: float


class SourceRef(BaseModel):
    granule: str
    concept_id: str
    collection: str | None
    version: str | None
    md5: str | None
    size_bytes: int | None
    qa_url: str | None


class JobInfo(BaseModel):
    id: int
    state: JobState
    stage: str | None
    progress: float
    error: str | None
    retryable: bool


class CaseDetail(CaseSummary):
    method: Method | None
    metrics: Metrics | None
    caveats: list[str]
    sources: list[SourceRef]
    job: JobInfo | None


class Scale(BaseModel):
    min: float
    max: float


class Layer(BaseModel):
    id: Literal["before_db", "after_db", "change_db"]
    label: str
    date: str | None = None
    url: str
    corners: list[tuple[float, float]] = Field(min_length=4, max_length=4, description="[lon, lat]: TL, TR, BR, BL")
    crs_note: str
    units: str
    scale: Scale
    palette: Literal["gray", "diverging"]
    nodata: Literal["transparent"]


class FindingProperties(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    kind: Literal["increase", "decrease"]
    label: str
    area_km2: float
    mean_delta_db: float
    median_before_db: float
    median_after_db: float
    valid_fraction: float
    quality: Literal["strong", "moderate", "weak"]
    quality_reason: str


class Finding(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str | int | None = None
    geometry: dict
    properties: FindingProperties


class FindingCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Finding]


class Evidence(BaseModel):
    sources: list[SourceRef]
    params: dict
    method_version: str | None
    reference_checks: list[dict]


class FindingDetail(Finding):
    case_id: str
    evidence: Evidence


class TimeseriesPoint(BaseModel):
    date: str
    granule: str
    mean_db: float
    p10_db: float
    p90_db: float
    valid_km2: float


class Timeseries(BaseModel):
    units: Literal["dB"] = "dB"
    points: list[TimeseriesPoint]


class SensitivityRow(BaseModel):
    threshold_db: float
    increase_km2: float
    decrease_km2: float
    increase_regions: int
    decrease_regions: int
    listed_findings_present: int


class Sensitivity(BaseModel):
    """The change result re-measured at other thresholds; empty when the case isn't ready or predates the file."""
    units: Literal["dB"] = "dB"
    published_threshold_db: float | None
    note: str | None
    rows: list[SensitivityRow]
    highest_threshold_by_finding: dict[str, float]  # listed finding id -> highest tested threshold it appears at


class JobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(min_length=1, max_length=100)


class JobCreated(BaseModel):
    job_id: int


class Job(BaseModel):
    id: int
    case_id: str
    state: JobState
    stage: str | None
    progress: float
    error: str | None
    error_code: str | None
    retryable: bool
    attempts: int
