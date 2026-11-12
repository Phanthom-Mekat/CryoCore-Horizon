// The observation brief: what was compared, from which NASA products, and what is and isn't claimed.
// Every value comes from the stored NASA metadata or the compatibility checks; nothing is computed from pixels yet.
import { compatibility, type Acquisition } from "./acquisitions";
import type { Region } from "./api";
import type { CaseSource } from "@/components/chattogram/CaseProvider";

export const METHOD_VERSION = "visual-quicklook-comparison/0.1";
export const CLAIM =
  "Visual comparison of NISAR GCOV browse quicklooks only. No backscatter change has been measured and no water has been classified; any difference seen is observed radar change, not a confirmed flood or recession.";

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
  quicklook: a.frozen ? { frozen_case_file: a.frozen.src, sha256: a.frozen.sha256, corners: a.frozen.corners, corners_from: a.frozen.cornersFrom } : "live from ASF",
});

export function briefJson(region: Region, before: Acquisition, after: Acquisition, shareUrl: string, origin: CaseSource, replayUrl: string | null) {
  return {
    title: `Observed radar change, ${region.name}: ${before.day} vs ${after.day}`,
    generated_utc: new Date().toISOString(),
    share_url: shareUrl,
    replay_url: replayUrl,
    data_source: origin.mode === "frozen" ? { mode: "frozen case", captured_utc: origin.frozenAt } : { mode: "live backend", frozen_case_captured_utc: origin.frozenAt },
    method_version: METHOD_VERSION,
    claim: CLAIM,
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
    attribution: "NISAR data: NASA and ISRO, distributed by the Alaska Satellite Facility DAAC (nisar-docs.asf.alaska.edu); discovered through NASA Earthdata CMR.",
  };
}

const cell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("+") : v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function briefCsv(before: Acquisition, after: Acquisition) {
  const rows = [before, after].map((a, i) => ({ role: i ? "after" : "before", ...source(a) }));
  const head = Object.keys(rows[0]);
  return [head.join(","), ...rows.map((r) => head.map((k) => cell(r[k as keyof typeof r])).join(","))].join("\n");
}

export function briefGeojson(before: Acquisition, after: Acquisition) {
  return {
    type: "FeatureCollection",
    features: [before, after].map((a, i) => ({
      type: "Feature",
      properties: { role: i ? "after" : "before", ...source(a), polarizations: a.polarizations.join("+"), claim: CLAIM },
      geometry: { type: "Polygon", coordinates: [a.footprint] },
    })),
  };
}

export function download(name: string, text: string, type: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}
