// The frozen case (plan F09): a versioned snapshot of everything the Chattogram pages need — the backend's division view,
// every intersecting scene's metadata, and the processed quicklooks for the stacks over the city — written by
// `pnpm freeze-case` into public/data/chattogram/case/. Replaying it needs no backend, no NASA and no ASF request.
// Plain module (types and constants only, plus a fetch), so the Node freeze script can import it too.
import type { Acquisition } from "./acquisitions";
import type { ExplorerData } from "../explorer-data";
import type { ProcessedCase, ProcessedImage } from "./processed";
import type { CaseDetail, CaseLayer, FindingDetail, Findings, Timeseries } from "./case-api";

/** The curated starting point: the city, which the most NISAR dates cover. Stacks over it are the ones frozen. */
export const FOCUS = { name: "Chattogram city", lonLat: [91.8317, 22.3569] as [number, number] };

export const FROZEN_DIR = "/data/chattogram/case/";
export const FROZEN_MANIFEST = `${FROZEN_DIR}case.json`;
export const FROZEN_VERSION = 1;

export type FrozenCase = {
  version: number;
  frozenAt: string; // ISO timestamp the snapshot was taken
  generator: string;
  processing: Record<string, string | number>;
  sources: { catalogue: string; quicklooks: string; backend: string };
  focus: typeof FOCUS;
  stacks: { id: string; dates: string[] }[];
  explorer: ExplorerData;
  /** Every scene that intersects the division; those in the frozen stacks carry `frozen` assets. */
  acquisitions: Acquisition[];
  totals: { scenes: number; images: number; bytes: number };
  /** The calibrated pilot as the backend published it, absent in snapshots taken before it existed. */
  pilot?: FrozenPilot | null;
  /** The curated case, only when the backend had published it from real NISAR files (never a synthetic QA bundle). */
  curated?: FrozenCurated | null;
};

/** The curated case as the backend served it; layer `url`s and `exports` point at files in `curated/`. */
export type FrozenCurated = {
  detail: CaseDetail;
  layers: CaseLayer[];
  findings: Findings;
  timeseries: Timeseries;
  findingDetails: Record<string, FindingDetail>;
  exports: Record<"json" | "csv" | "geojson", string>;
  files: Record<string, { src: string; sha256: string; bytes: number }>;
};

/**
 * `files` is keyed by the path after /api/earth/cases/{id}/ (`display/<name>` PNG previews, `assets/<name>` GeoTIFFs),
 * so the pages swap a live URL for its frozen copy one to one. Pixel sampling has no frozen copy: it reads the rasters.
 */
export type FrozenPilot = {
  case: ProcessedCase;
  corners: ProcessedImage["corners"];
  files: Record<string, { src: string; sha256: string; bytes: number }>;
};

/** The bundle if this deployment ships one, else null. */
export async function loadFrozen(): Promise<FrozenCase | null> {
  try {
    const r = await fetch(FROZEN_MANIFEST);
    if (!r.ok) return null;
    const c = (await r.json()) as FrozenCase;
    return c.version === FROZEN_VERSION ? c : null;
  } catch {
    return null;
  }
}
