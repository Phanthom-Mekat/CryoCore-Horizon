export type ProcessedCase = {
  id: string; title: string; method: string; claim: string; limitations: string[];
  sources: { concept_id: string; acquisition: string; granule_id: string; collection: string }[];
  statistics: Record<"HHHH" | "HVHV", { common_area_km2: number; outside_roi_area_km2: number; common_valid_pixels: number; excluded_pixels: number; median_change_db: number }>;
  assets: { name: string; sha256: string; units: string; bytes: number }[];
};
export type ProcessedImage = { url: string; corners: [[number, number], [number, number], [number, number], [number, number]] };
