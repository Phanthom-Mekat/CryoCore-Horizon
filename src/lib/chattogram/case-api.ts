// The processed-case contract (backend B3, /api/v1/cases…). Plain-data shapes come from the generated OpenAPI schema
// (`pnpm api:types`); the GeoJSON and layer shapes stay hand-written because the schema types them as loose dicts.
// Every number in these shapes comes from the backend's processing of real NISAR files (or, only when
// `synthetic_fixture` is true, from QA test fixtures, which the UI labels loudly); the UI never fills gaps.
import type { components } from "./api-schema";
import type { ProcessedImage } from "./processed";
import { fmtNum, fmtSigned } from "@/lib/i18n/format";

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

/** HH layers detect; the HV ones (cross-polarization) are processed the same way and shown for comparison only. */
export type LayerId = "before_db" | "after_db" | "change_db" | "before_hv_db" | "after_hv_db" | "change_hv_db";
export type CaseLayer = {
  id: LayerId;
  label: string;
  /** "HH" or "HV"; absent in bundles published before HV was processed (all HH then). */
  polarization?: string | null;
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
  /** Mean HV change over the same pixels (null when none is valid in HV); absent before HV was processed. */
  cross_pol_mean_delta_db?: number | null;
  cross_pol_valid_fraction?: number | null;
};
export type Finding = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, FindingProps>;
export type Findings = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, FindingProps>;
export type FindingDetail = Finding & {
  evidence: { sources: CaseSource[]; params: Record<string, unknown>; method_version: string; reference_checks: unknown[] };
};

export type Timeseries = S["Timeseries"];
/** The change result re-measured at other thresholds (backend/app/processing/sensitivity.py). */
export type Sensitivity = S["Sensitivity"];

/** Everything the views need once the case is ready. */
export type ProcessedCase = { detail: CaseDetail; layers: CaseLayer[]; findings: Findings; timeseries: Timeseries; sensitivity: Sensitivity | null };

/** A layer's polarization: HH for bundles that predate the label. */
export const layerPol = (l: Pick<CaseLayer, "polarization">) => l.polarization ?? "HH";

/** The highest tested threshold (dB) at which a listed finding still appears, or null when not measured. */
export const holdsTo = (s: Sensitivity | null, id: string) => s?.highest_threshold_by_finding[id] ?? null;

/** True when a finding changes the same way in HV as in HH; null when HV has no value for it. */
export const crossAgrees = (p: Pick<FindingProps, "kind" | "cross_pol_mean_delta_db">) =>
  p.cross_pol_mean_delta_db == null ? null : p.cross_pol_mean_delta_db > 0 === (p.kind === "increase");

/** States in which the backend is still working and the case should be polled. */
export const isBusy = (d: CaseDetail) => d.status === "queued" || d.status === "running" || d.job?.state === "queued" || d.job?.state === "running";

/**
 * The backend names its assets under /api/v1/…; the browser only talks to our proxy. The file name is kept and the rest
 * rebuilt. `v` (the backend's, else the case's update time) gives a republished case new URLs, so assets can be cached.
 */
export function assetUrl(caseId: string, layer: CaseLayer, updatedAt: string) {
  if (layer.url.startsWith("/data/")) return layer.url; // a frozen-case file, served as is
  const u = new URL(layer.url, "http://backend");
  const name = u.pathname.split("/").pop() ?? "";
  const v = u.searchParams.get("v") || updatedAt;
  return `/api/earth/curated-cases/${encodeURIComponent(caseId)}/assets/${encodeURIComponent(name)}?v=${encodeURIComponent(v)}`;
}

/** dB to one decimal in the interface language, with a typographic minus (and a + when `signed`). */
export const fmtDb = (v: number, signed = false) => `${signed ? fmtSigned(v, 1) : fmtNum(v, 1)} dB`;
/** "name/version" of the case's method, or a plain statement that none was recorded. */
export const methodId = (d: Pick<CaseDetail, "method">) => (d.method ? `${d.method.name}/${d.method.version}` : "method not recorded");

/** A processed layer as the map draws it (CaseMap's `processed` image): our proxy URL and the layer's four corners. */
export const layerImage = (caseId: string, layer: CaseLayer, updatedAt: string): ProcessedImage => ({
  url: assetUrl(caseId, layer, updatedAt),
  corners: layer.corners as ProcessedImage["corners"],
});
