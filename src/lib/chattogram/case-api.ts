// The processed-case contract (backend B3, /api/v1/cases…). Plain-data shapes come from the generated OpenAPI schema
// (`pnpm api:types`); the GeoJSON and layer shapes stay hand-written because the schema types them as loose dicts.
// Every number in these shapes comes from the backend's processing of real NISAR files (or, only when
// `synthetic_fixture` is true, from QA test fixtures, which the UI labels loudly); the UI never fills gaps.
import type { components } from "./api-schema";
import type { ProcessedImage } from "./processed";

type S = components["schemas"];

/** The one curated case: a team-drawn rectangle on the lower Karnaphuli river / Chattogram port. */
export const CASE_ID = "karnaphuli-estuary";

export type CaseStatus = S["CaseSummary"]["status"];
export type CaseAcq = { granule: string; concept_id: string; date: string };

export type CaseSummary = {
  id: string;
  title: string;
  place: string;
  status: CaseStatus;
  stack: string;
  before: CaseAcq;
  after: CaseAcq;
  analysis_area: GeoJSON.Feature<GeoJSON.Polygon, { provenance: string; name?: string; provenance_note?: string | null } | null>;
  updated_at: string;
  /** True only for a QA bundle made from synthetic test fixtures (never NISAR); the backend serves it only in QA mode. */
  synthetic_fixture: boolean;
};

export type Job = {
  id: string | number;
  case_id?: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: string | null;
  progress: number; // 0..1
  error: string | null;
  retryable: boolean;
  attempts?: number;
};

export type CaseMetrics = S["Metrics"];

export type CaseSource = S["SourceRef"];

export type CaseDetail = CaseSummary & {
  /** null until the case is processed */
  method: { name: string; version: string; params: Record<string, unknown> } | null;
  metrics: CaseMetrics | null;
  caveats: string[];
  sources: CaseSource[];
  job: Job | null;
};

export type LayerId = "before_db" | "after_db" | "change_db";
export type CaseLayer = {
  id: LayerId;
  label: string;
  date?: string | null;
  url: string; // /api/v1/cases/{id}/assets/<file>.png?v=…, rewritten to our proxy by assetUrl()
  corners: [number, number][]; // [lon, lat] TL, TR, BR, BL
  crs_note: string;
  units: string;
  scale: { min: number; max: number };
  palette: "gray" | "diverging";
  nodata: "transparent";
};

export type FindingProps = {
  id: string;
  kind: "increase" | "decrease";
  label: string; // always "Observed radar change"
  area_km2: number;
  mean_delta_db: number;
  median_before_db: number;
  median_after_db: number;
  valid_fraction: number;
  quality: "strong" | "moderate" | "weak";
  quality_reason: string;
};
export type Finding = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, FindingProps>;
export type Findings = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, FindingProps>;
export type FindingDetail = Finding & {
  evidence: { sources: CaseSource[]; params: Record<string, unknown>; method_version: string; reference_checks: unknown[] };
};

export type Timeseries = S["Timeseries"];

/** Everything the views need once the case is ready. */
export type ProcessedCase = { detail: CaseDetail; layers: CaseLayer[]; findings: Findings; timeseries: Timeseries };

/** States in which the backend is still working and the case should be polled. */
export const isBusy = (d: CaseDetail) => d.status === "queued" || d.status === "running" || d.job?.state === "queued" || d.job?.state === "running";

/**
 * The backend names its assets under /api/v1/…; the browser only talks to our proxy. The file name is kept and the rest
 * rebuilt. `v` (the backend's, else the case's update time) gives a republished case new URLs, so assets can be cached.
 */
export function assetUrl(caseId: string, layer: CaseLayer, updatedAt: string) {
  const u = new URL(layer.url, "http://backend");
  const name = u.pathname.split("/").pop() ?? "";
  const v = u.searchParams.get("v") || updatedAt;
  return `/api/earth/curated-cases/${encodeURIComponent(caseId)}/assets/${encodeURIComponent(name)}?v=${encodeURIComponent(v)}`;
}

export const fmtKm2 = (v: number) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} km²`;
export const fmtDb = (v: number, signed = false) => `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} dB`;
/** "name/version" of the case's method, or a plain statement that none was recorded. */
export const methodId = (d: Pick<CaseDetail, "method">) => (d.method ? `${d.method.name}/${d.method.version}` : "method not recorded");

/** A processed layer as the map draws it (CaseMap's `processed` image): our proxy URL and the layer's four corners. */
export const layerImage = (caseId: string, layer: CaseLayer, updatedAt: string): ProcessedImage => ({
  url: assetUrl(caseId, layer, updatedAt),
  corners: layer.corners as ProcessedImage["corners"],
});
