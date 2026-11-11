// Typed client for the Chattogram backend (backend/app/main.py). Types come from its OpenAPI schema:
// regenerate with `npm run api:types` while the backend runs on :8000.
import type { components } from "./api-schema";

export type Scene = components["schemas"]["Scene"];
export type ScenePage = components["schemas"]["ScenePage"];
export type SearchRequest = components["schemas"]["SearchRequest"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type Product = Scene["product"];

/** /api/v1/region has no response model in the backend yet, so this mirrors backend/app/region.py by hand. */
export type Region = {
  id: string;
  name: string;
  country: string;
  bbox: [number, number, number, number];
  crs: string;
  boundary_type: string;
  boundary_note: string;
  research_themes: string[];
  primary_mission: string;
};

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
    r = await fetch(API_BASE + path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError(`The backend at ${API_BASE} isn’t reachable. Start it with uvicorn (see backend/README.md).`, "unavailable");
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${r.status}`;
    throw new ApiError(`${path}: ${detail}`, r.status === 404 ? "unavailable" : "failed");
  }
  return r.json() as Promise<T>;
}

export const api = {
  region: () => call<Region>("/api/v1/region"),
  scenes: (product: Product = "GCOV", limit = 100, offset = 0) => call<ScenePage>(`/api/v1/scenes?product=${product}&limit=${limit}&offset=${offset}`),
  scene: (conceptId: string) => call<Scene>(`/api/v1/scenes/${encodeURIComponent(conceptId)}`),
  search: (req: SearchRequest) => call<SearchResponse>("/api/v1/nasa/search", { method: "POST", body: JSON.stringify(req) }),
  /** Planned in IMPLEMENTATION_PLAN.md (B3); answers 404 until the backend implements it. */
  cases: () => call<unknown[]>("/api/v1/cases"),
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
