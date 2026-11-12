// Turns raw CMR scene records (as stored by the backend) into the acquisition facts the interface shows.
// Everything here is read from NASA metadata; nothing is estimated.
import type { Scene } from "./api";

export type Acquisition = {
  conceptId: string;
  granule: string;
  /** CMR collection, e.g. NISAR_L2_GCOV_PROVISIONAL_V1. Its name carries the data maturity. */
  collection: string;
  /** Maturity named in the collection; null when the collection doesn't name one. */
  maturity: "Beta" | "Provisional" | null;
  start: string; // ISO timestamp, UTC
  day: string; // YYYY-MM-DD
  track: number | null;
  frame: number | null;
  direction: "Ascending" | "Descending" | "Unknown";
  /** Same stack = same track, frame and direction, so the radar viewing geometry matches. */
  stack: string;
  polarizations: string[]; // frequency A, e.g. ["HH", "HV"]
  frequencies: string[];
  version: string | null;
  pipeline: string | null;
  orbit: number | null;
  sizeBytes: number | null;
  md5: string | null; // of the HDF5 product, from NASA metadata
  produced: string | null; // production timestamp
  footprint: [number, number][]; // closed ring, [lon, lat]
  browse: { png: string; kml: string } | null;
  qaReport: string | null;
  dataUrl: string | null;
  /** Present when the processed quicklook ships in the frozen case (src/lib/chattogram/frozen.ts). */
  frozen?: FrozenAsset;
};

export type FrozenAsset = {
  src: string; // same-origin URL of the processed quicklook
  corners: [number, number][]; // top-left, top-right, bottom-right, bottom-left
  cornersFrom: "kml" | "footprint";
  sha256: string;
  bytes: number;
};

type Attr = { Name: string; Values: string[] };
type Umm = {
  AdditionalAttributes?: Attr[];
  OrbitCalculatedSpatialDomains?: { OrbitNumber?: number }[];
  DataGranule?: { ProductionDateTime?: string; ArchiveAndDistributionInformation?: { Name: string; SizeInBytes?: number; Checksum?: { Value?: string; Algorithm?: string } }[] };
};
type Url = { URL?: string; Type?: string; Subtype?: string };

export function toAcquisition(s: Scene): Acquisition {
  const umm = ((s.metadata as { umm?: Umm }).umm ?? {}) as Umm;
  const attr = (n: string) => umm.AdditionalAttributes?.find((a) => a.Name === n)?.Values ?? [];
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const dir = attr("ASCENDING_DESCENDING")[0];
  const urls = (s.urls as Url[]).map((u) => u.URL ?? "").filter((u) => u.startsWith("https://"));
  const pick = (suffix: string) => urls.find((u) => u.endsWith(suffix)) ?? null;
  const png = pick("_LATLON.png");
  const kml = pick("_LATLON.kml"); // under BROWSE/ for newer products, NISAR/ for older ones
  const file = umm.DataGranule?.ArchiveAndDistributionInformation?.find((f) => f.Name.endsWith(".h5"));
  const track = num(attr("TRACK_NUMBER")[0]);
  const frame = num(attr("FRAME_NUMBER")[0]);
  const start = s.start_time ?? "";
  return {
    conceptId: s.concept_id,
    granule: s.granule_id,
    collection: s.collection,
    maturity: /BETA/i.test(s.collection) ? "Beta" : /PROVISIONAL/i.test(s.collection) ? "Provisional" : null,
    start,
    day: start.slice(0, 10),
    track,
    frame,
    direction: dir === "ASCENDING" ? "Ascending" : dir === "DESCENDING" ? "Descending" : "Unknown",
    stack: attr("STACK_ID")[0] ?? `${track ?? "?"}_${dir?.[0] ?? "?"}_${frame ?? "?"}`,
    polarizations: attr("FREQUENCY_A_POLARIZATION"),
    frequencies: attr("FREQUENCIES"),
    version: attr("PRODUCT_VERSION")[0] ?? null,
    pipeline: attr("PRODUCTION_PIPELINE")[0] ?? null,
    orbit: umm.OrbitCalculatedSpatialDomains?.[0]?.OrbitNumber ?? null,
    sizeBytes: file?.SizeInBytes ?? null,
    md5: file?.Checksum?.Algorithm === "MD5" ? (file.Checksum.Value ?? null) : null,
    produced: umm.DataGranule?.ProductionDateTime ?? null,
    footprint: footprintOf(s),
    browse: png && kml ? { png, kml } : null,
    qaReport: pick("_QA_REPORT.pdf"),
    dataUrl: pick(".h5"),
  };
}

function footprintOf(s: Scene): [number, number][] {
  type Pt = { Longitude: number; Latitude: number };
  const ext = s.spatial_extent as { HorizontalSpatialDomain?: { Geometry?: { GPolygons?: { Boundary?: { Points?: Pt[] } }[] } } };
  const pts = ext.HorizontalSpatialDomain?.Geometry?.GPolygons?.[0]?.Boundary?.Points ?? [];
  return pts.map((p) => [p.Longitude, p.Latitude]);
}

/** Ray-casting point-in-polygon on lon/lat; fine at this scale and latitude. */
export function covers(a: Acquisition, [x, y]: [number, number]) {
  let inside = false;
  const r = a.footprint;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Acquisitions grouped by stack, newest first inside each, stacks with the most dates first.
 * A date the catalogue lists more than once (reprocessed, or split by polarization) keeps one scene: the newest
 * version, then the one with HH and the most polarizations, so dates within a stack stay comparable.
 */
const polScore = (a: Acquisition) => (a.polarizations.includes("HH") ? 10 : 0) + a.polarizations.length;
const better = (a: Acquisition, b: Acquisition) => {
  const v = (a.version ?? "").localeCompare(b.version ?? "", undefined, { numeric: true });
  return v > 0 || (v === 0 && polScore(a) > polScore(b));
};

export function stacks(list: Acquisition[]) {
  const by = new Map<string, Acquisition[]>();
  for (const a of list) {
    const items = by.get(a.stack) ?? [];
    const twin = items.findIndex((x) => x.day === a.day);
    if (twin < 0) items.push(a);
    else if (better(a, items[twin])) items[twin] = a;
    by.set(a.stack, items);
  }
  return [...by.entries()]
    .map(([id, items]) => ({ id, items: items.sort((x, y) => y.start.localeCompare(x.start)) }))
    .sort((a, b) => b.items.length - a.items.length || a.id.localeCompare(b.id));
}


/** What could make two dates in a stack unfair to compare. Empty means none found in the metadata. */
export function compatibility(a: Acquisition, b: Acquisition) {
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  return [
    { key: "geometry", ok: a.stack === b.stack, label: "Same track, frame and pass direction", detail: `${a.stack} vs ${b.stack}` },
    { key: "polarizations", ok: same(a.polarizations, b.polarizations), label: "Same polarizations", detail: `${a.polarizations.join("+")} vs ${b.polarizations.join("+")}` },
    { key: "maturity", ok: a.collection === b.collection, label: "Same data maturity and collection", detail: `${a.collection} vs ${b.collection}` },
    { key: "version", ok: a.version === b.version, label: "Same product version", detail: `v${a.version} vs v${b.version}` },
  ];
}
