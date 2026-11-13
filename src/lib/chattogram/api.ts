// Typed client for the Chattogram backend (backend/app/main.py), always through the Next.js server proxy
// (src/lib/backend-proxy.ts) so the browser never needs to reach the backend itself. Scene types come from the
// backend's OpenAPI schema: regenerate with `pnpm api:types` while the backend runs on :8000.
import type { components } from "./api-schema";
import type { ExplorerData } from "@/lib/explorer-data";
import type { ProcessedCase } from "./processed";
import type { CaseDetail, CaseLayer, FindingDetail, Findings, Sensitivity, Timeseries } from "./case-api";

export type Scene = components["schemas"]["Scene"];
export type ScenePage = components["schemas"]["ScenePage"];
export type SearchRequest = components["schemas"]["SearchRequest"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type Product = Scene["product"];
/** Division boundary, bounds and provenance, from /api/v1/explorer. */
export type Region = ExplorerData["region"];

/**
 * Every view renders exactly one of these. `unavailable` means the backend can't be reached or the feature isn't
 * built yet; `failed` means it answered with an error; `empty` means it answered and there is nothing to show.
 */
export type Load<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "failed",
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError("This page can’t reach the app server. Check that `pnpm dev` is running.", "unavailable");
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${r.status}`;
    // the proxy answers 503 when the FastAPI backend is down, and 404 for routes that don't exist yet
    throw new ApiError(detail, r.status === 503 || r.status === 404 ? "unavailable" : "failed");
  }
  return r.json() as Promise<T>;
}

export const api = {
  explorer: () => call<ExplorerData>("/api/earth/explorer"),
  scenes: (product: Product = "GCOV", limit = 100, offset = 0) => call<ScenePage>(`/api/earth/scenes?product=${product}&limit=${limit}&offset=${offset}`),
  search: (req: SearchRequest) => call<SearchResponse>("/api/earth/search", { method: "POST", body: JSON.stringify(req) }),
  /** Processed cases (backend/app/cases.py), through src/app/api/earth/cases. */
  cases: () => call<{ cases: ProcessedCase[] }>("/api/earth/cases").then((r) => r.cases),
  /** The processed case (plan B3), through the read-only proxy at /api/earth/curated-cases. */
  case: (id: string) => call<CaseDetail>(`/api/earth/curated-cases/${id}`),
  layers: (id: string) => call<CaseLayer[]>(`/api/earth/curated-cases/${id}/layers`),
  findings: (id: string) => call<Findings>(`/api/earth/curated-cases/${id}/findings`),
  finding: (id: string, fid: string) => call<FindingDetail>(`/api/earth/curated-cases/${id}/findings/${encodeURIComponent(fid)}`),
  timeseries: (id: string) => call<Timeseries>(`/api/earth/curated-cases/${id}/timeseries`),
  sensitivity: (id: string) => call<Sensitivity>(`/api/earth/curated-cases/${id}/sensitivity`),
  exportUrl: (id: string, format: "json" | "csv" | "geojson") => `/api/earth/curated-cases/${id}/export?format=${format}`,
};

/** Every stored scene of one product (the API pages at 100). */
export async function allScenes(product: Product = "GCOV") {
  const out: Scene[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api.scenes(product, 100, offset);
    out.push(...page.scenes);
    if (out.length >= page.total || page.scenes.length === 0) return out;
  }
}

export const toLoadError = (e: unknown): Load<never> =>
  e instanceof ApiError ? { status: e.kind, reason: e.message } : { status: "failed", reason: e instanceof Error ? e.message : String(e) };
