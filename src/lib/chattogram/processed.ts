type PolStats = {
  common_area_km2: number; outside_roi_area_km2: number; common_valid_pixels: number; excluded_pixels: number; excluded_area_km2: number;
  median_change_db: number; change_percentiles_db: [number, number, number]; // 5th, 50th, 95th (backend/app/subset.py)
};
export type ProcessedCase = {
  id: string; title: string; status: string; method: string; created_at: string; claim: string; limitations: string[];
  sources: { concept_id: string; revision_id: number; etag: string; acquisition: string; granule_id: string; collection: string; full_file_checksum_verified: boolean }[];
  crs: string; bounds: [number, number, number, number]; transform: number[]; validity_rule: string; alignment: string;
  /** The processed window in WGS84 (backend read_case); absent from snapshots taken before it was published. */
  footprint_wgs84?: GeoJSON.Polygon;
  statistics: Record<"HHHH" | "HVHV", PolStats>;
  assets: { name: string; sha256: string; units: string; bytes: number }[];
};
export type ProcessedImage = { url: string; corners: [[number, number], [number, number], [number, number], [number, number]] };

/** The calibrated HH/HV pilot (backend/app/subset.py), the only processed method so far. */
export const pilotOf = (cases: ProcessedCase[]) => cases.find((c) => c.method === "gcov-window-v1") ?? null;

/** True when the pilot was computed from exactly these two acquisitions, in this order. */
export const pilotCovers = (pilot: ProcessedCase, beforeId: string, afterId: string) =>
  pilot.sources.length === 2 && pilot.sources[0].concept_id === beforeId && pilot.sources[1].concept_id === afterId;
