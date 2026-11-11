import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type SceneProperties = {
  id: string; name: string; product: string; date: string | null; end_time: string | null;
  track: string | null; frame: string | null; direction: string | null; polarization: string | null;
  maturity: string; revision: number; retrieved_at: string; source_url: string;
};
export type SceneCollection = FeatureCollection<Polygon | MultiPolygon, SceneProperties>;
export type ExplorerData = {
  region: {
    name: string; country: string; bbox: [number, number, number, number]; boundary: FeatureCollection;
    provenance: { source: string; source_url: string; year: number; license: string; license_url: string; note: string; sha256: string };
  };
  scenes: SceneCollection;
  summary: { stored_records: number; intersecting_records: number; outside_division: number; missing_geometry: number; observation_days: number; latest_retrieval: string | null };
  timeline: { date: string; count: number }[];
  notice: string;
};
export const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unavailable";

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The request could not be completed. Check the dates and try again.");
  return data as T;
}
