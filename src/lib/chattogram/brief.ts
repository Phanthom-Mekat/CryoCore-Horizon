// The observation brief: what was compared, from which NASA products, and what is and isn't claimed.
// Pair values come from the stored NASA metadata and the compatibility checks; once the backend has published the
// processed case, its metrics and findings are added exactly as served, with the method version and source granules.
import { compatibility, type Acquisition } from "./acquisitions";
import type { Region } from "./api";
import { methodId, type ProcessedCase } from "./case-api";

export const METHOD_VERSION = "visual-quicklook-comparison/0.1";
export const CLAIM =
  "Visual comparison of NISAR GCOV browse quicklooks only. No backscatter change has been measured and no water has been classified; any difference seen is observed radar change, not a confirmed flood or recession.";

export const PROCESSED_CLAIM =
  "Measured: signed change in calibrated NISAR GCOV backscatter (gamma-0, dB) between two acquisitions of the same orbit track and frame, over pixels valid in both. Not interpreted: each area is observed radar change, not a confirmed water change, flood or damage.";

export const SYNTHETIC_CLAIM =
  "SYNTHETIC QA DATA - NOT NISAR. Processed from generated test fixtures to check the pipeline; no value is an observation of any place or date.";

/** The processed case as exported: null unless the backend has published it. */
function processedSection(pc: ProcessedCase | null | undefined, before: Acquisition, after: Acquisition) {
  if (!pc || pc.detail.status !== "ready") return null;
  const d = pc.detail;
  return {
    id: d.id,
    title: d.title,
    place: d.place,
    published_utc: d.updated_at,
    claim: d.synthetic_fixture ? SYNTHETIC_CLAIM : PROCESSED_CLAIM,
    synthetic_fixture: d.synthetic_fixture,
    same_pair_as_compared: d.before.granule === before.granule && d.after.granule === after.granule,
    pair: { before: d.before, after: d.after },
    analysis_area: { provenance: d.analysis_area.properties?.provenance ?? null, geometry: d.analysis_area.geometry },
    method: d.method,
    metrics: d.metrics,
    caveats: d.caveats,
    sources: d.sources,
    findings: pc.findings.features.map((f) => f.properties),
  };
}

const source = (a: Acquisition) => ({
  granule: a.granule,
  cmr_concept_id: a.conceptId,
  collection: a.collection,
  maturity: a.maturity ?? "not labelled beta/provisional",
  product_version: a.version,
  acquired_utc: a.start,
  produced_utc: a.produced,
  track: a.track,
  frame: a.frame,
  direction: a.direction,
  orbit: a.orbit,
  polarizations: a.polarizations,
  hdf5_md5: a.md5,
  qa_report: a.qaReport,
});

export function briefJson(region: Region, before: Acquisition, after: Acquisition, shareUrl: string, pc?: ProcessedCase | null) {
  const p = processedSection(pc, before, after);
  return {
    title: `Observed radar change, ${region.name}: ${before.day} vs ${after.day}`,
    generated_utc: new Date().toISOString(),
    share_url: shareUrl,
    method_version: p?.same_pair_as_compared ? methodId(p) : METHOD_VERSION,
    claim: p?.same_pair_as_compared ? p.claim : CLAIM,
    region: {
      name: region.name,
      country: region.country,
      bbox_wgs84: region.bbox,
      boundary_source: region.provenance.source,
      boundary_year: region.provenance.year,
      boundary_license: region.provenance.license,
      boundary_note: region.provenance.note,
    },
    compared: { before: source(before), after: source(after), days_apart: Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5) },
    compatibility: compatibility(before, after),
    processed_case: p,
    attribution: "NISAR data: NASA and ISRO, distributed by the Alaska Satellite Facility DAAC (nisar-docs.asf.alaska.edu); discovered through NASA Earthdata CMR.",
  };
}

const cell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("+") : v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function briefCsv(before: Acquisition, after: Acquisition, pc?: ProcessedCase | null) {
  const p = processedSection(pc, before, after);
  const rows: Record<string, unknown>[] = [
    ...[before, after].map((a, i) => ({ role: i ? "after" : "before", ...source(a) })),
    // one row per finding, with the pair, method and claim it rests on
    ...(p?.findings ?? []).map((f) => ({
      role: "finding",
      ...f,
      before_granule: p!.pair.before.granule,
      after_granule: p!.pair.after.granule,
      before_date: p!.pair.before.date,
      after_date: p!.pair.after.date,
      method: methodId(p!),
      claim: p!.claim,
    })),
  ];
  const head = [...new Set(rows.flatMap(Object.keys))];
  return [head.join(","), ...rows.map((r) => head.map((k) => cell(r[k])).join(","))].join("\n");
}

export function briefGeojson(before: Acquisition, after: Acquisition, pc?: ProcessedCase | null) {
  const p = processedSection(pc, before, after);
  const provenance = p && { before_granule: p.pair.before.granule, after_granule: p.pair.after.granule, method: methodId(p), claim: p.claim, synthetic_fixture: p.synthetic_fixture };
  return {
    type: "FeatureCollection",
    features: [
      ...[before, after].map((a, i) => ({
        type: "Feature",
        properties: { role: i ? "after" : "before", ...source(a), polarizations: a.polarizations.join("+"), claim: CLAIM },
        geometry: { type: "Polygon", coordinates: [a.footprint] },
      })),
      ...(p && pc
        ? [
            { type: "Feature", properties: { role: "analysis_area", name: p.title, provenance: p.analysis_area.provenance }, geometry: p.analysis_area.geometry },
            ...pc.findings.features.map((f) => ({ type: "Feature", properties: { role: "finding", ...f.properties, ...provenance }, geometry: f.geometry })),
          ]
        : []),
    ],
  };
}

export function download(name: string, text: string, type: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
