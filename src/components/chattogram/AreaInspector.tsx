"use client";
import { useEffect, useState } from "react";
import { download } from "@/lib/chattogram/brief";
import { fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "./BackendText";

type Point = [number, number];
type Row = { polarization: string; valid_pixels: number; excluded_pixels: number; valid_area_km2: number; excluded_area_km2: number; before_median_db: number | null; after_median_db: number | null; change_median_db: number | null; histogram_counts: number[] };
type Area = { status: string; case_id: string; geometry?: GeoJSON.Polygon; selected_area_km2: number; selected_pixels: number; clipped_to_extent: boolean; measurements: Row[]; histogram_labels: string[]; limitations: string[] };
const num = (v: number | null) => v === null ? "—" : fmtNum(v, 2);
/** A number in one of the backend's bin labels ("−6", "2"), formatted for the language. */
const binNum = (v: string) => fmtNum(Number(v.replace("−", "-")));

export function AreaInspector({ caseId, points, onSelect, center, onGeometry }: {
  caseId: string; points: Point[]; onSelect: (p: Point) => void; center: Point;
  onGeometry: (geometry: GeoJSON.Polygon | null) => void;
}) {
  const t = useT();
  const a = t.area;
  const key = `${caseId}/${points.flat().join(",")}`;
  const [result, setResult] = useState<{ key: string; data?: Area; failed?: true } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pol, setPol] = useState("HH");
  useEffect(() => {
    if (points.length !== 2) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ lon1:String(points[0][0]),lat1:String(points[0][1]),lon2:String(points[1][0]),lat2:String(points[1][1]) });
    fetch(`/api/earth/cases/${caseId}/area?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async r => { if (!r.ok) throw new Error(`area ${r.status}`); return r.json() as Promise<Area>; })
      .then(data => { if (!controller.signal.aborted) { setResult({key,data}); onGeometry(data.geometry ?? null); } })
      .catch(() => { if (!controller.signal.aborted) setResult({key,failed:true}); });
    return () => controller.abort();
  }, [caseId, points, key, attempt, onGeometry]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const row = data?.measurements.find(m => m.polarization === pol);
  const max = Math.max(1, ...(row?.histogram_counts ?? []));
  /** The bin label in the interface language, or null for a label of another shape (then shown as sent). */
  const bin = (label: string) => {
    const range = label.match(/^(−?\d+) to (−?\d+)$/), below = label.match(/^< (−?\d+)$/), above = label.match(/^≥ (−?\d+)$/);
    if (range) return a.bin.range(binNum(range[1]), binNum(range[2]));
    if (below) return a.bin.below(binNum(below[1]));
    if (above) return a.bin.above(binNum(above[1]));
    return null;
  };
  return <section className="c-panel-block p-area-inspector" aria-label={a.label}>
    <p className="c-eyebrow">{a.label}</p><h2>{a.title}</h2>
    <p className="c-hint">{a.hint}</p>
    <button className="c-btn" onClick={() => onSelect(center)}>{points.length === 1 ? a.secondCentre : a.startCentre}</button>
    <p role="status">{a.corners[Math.min(points.length, 2)]}</p>
    {points.length === 2 && !current && <p role="status">{a.reading}</p>}
    {current?.failed && <><p role="alert">{a.error}</p><button className="c-btn" onClick={() => setAttempt(n => n+1)}>{a.retry}</button></>}
    {data?.status === "outside_extent" && <p>{a.outside}</p>}
    {data?.geometry && <>
      <p>{a.selected(<strong key="area">{fmtNum(data.selected_area_km2, 4)} km²</strong>, fmtNum(data.selected_pixels))}</p>
      {data.clipped_to_extent && <p className="p-pixel-empty">{a.clipped}</p>}
      <label>{a.pol} <select className="c-select" value={pol} onChange={e => setPol(e.target.value)}><option>HH</option><option>HV</option></select></label>
      {row && <>
        <dl className="c-facts"><div><dt>{a.validArea}</dt><dd>{fmtNum(row.valid_area_km2, 4)} km²</dd></div><div><dt>{a.excludedArea}</dt><dd>{fmtNum(row.excluded_area_km2, 4)} km²</dd></div><div><dt>{a.beforeMedian}</dt><dd>{num(row.before_median_db)} dB</dd></div><div><dt>{a.afterMedian}</dt><dd>{num(row.after_median_db)} dB</dd></div><div><dt>{a.medianChange}</dt><dd>{num(row.change_median_db)} dB</dd></div></dl>
        {row.valid_pixels ? <><h3>{a.distribution}</h3><div className="p-histogram" aria-label={a.histogram}>{row.histogram_counts.map((n,i) => <div key={i}><span><BackendText text={data.histogram_labels[i]} translated={bin(data.histogram_labels[i]) ?? undefined} /> dB</span><meter min={0} max={max} value={n} aria-label={a.binCount(bin(data.histogram_labels[i]) ?? data.histogram_labels[i], fmtNum(n))} /><strong>{fmtNum(n)}</strong></div>)}</div></> : <p className="p-pixel-empty">{a.noValid}</p>}
      </>}
      <p className="c-hint">{a.caution}</p>
      <details><summary>{a.limitations}</summary><ul className="p-limitations">{data.limitations.map(l => <li key={l}><BackendText text={l} translated={t.processed.texts[l]} /></li>)}</ul></details>
      <div className="c-links"><button className="c-btn" onClick={() => download(`radar-area-${caseId}.json`,JSON.stringify(data,null,2),"application/json")}>{a.exportJson}</button><button className="c-btn" onClick={() => download(`radar-area-${caseId}.geojson`,JSON.stringify({type:"Feature",geometry:data.geometry,properties:{...data,geometry:undefined}},null,2),"application/geo+json")}>{a.exportGeojson}</button></div>
    </>}
  </section>;
}
