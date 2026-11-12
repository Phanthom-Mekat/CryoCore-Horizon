"use client";
import { useEffect, useState } from "react";
import { download } from "@/lib/chattogram/brief";

type Point = [number, number];
type Row = { polarization: string; valid_pixels: number; excluded_pixels: number; valid_area_km2: number; excluded_area_km2: number; before_median_db: number | null; after_median_db: number | null; change_median_db: number | null; histogram_counts: number[] };
type Area = { status: string; case_id: string; geometry?: GeoJSON.Polygon; selected_area_km2: number; selected_pixels: number; clipped_to_extent: boolean; measurements: Row[]; histogram_labels: string[]; limitations: string[] };
const num = (v: number | null) => v === null ? "—" : v.toFixed(2);

export function AreaInspector({ caseId, points, onSelect, center, onGeometry }: {
  caseId: string; points: Point[]; onSelect: (p: Point) => void; center: Point;
  onGeometry: (geometry: GeoJSON.Polygon | null) => void;
}) {
  const key = `${caseId}/${points.flat().join(",")}`;
  const [result, setResult] = useState<{ key: string; data?: Area; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pol, setPol] = useState("HH");
  useEffect(() => {
    if (points.length !== 2) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ lon1:String(points[0][0]),lat1:String(points[0][1]),lon2:String(points[1][0]),lat2:String(points[1][1]) });
    fetch(`/api/earth/cases/${caseId}/area?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async r => { if (!r.ok) throw new Error("Area analysis is unavailable. Try a smaller selection inside the radar window."); return r.json() as Promise<Area>; })
      .then(data => { if (!controller.signal.aborted) { setResult({key,data}); onGeometry(data.geometry ?? null); } })
      .catch(e => { if (!controller.signal.aborted) setResult({key,error:e.message}); });
    return () => controller.abort();
  }, [caseId, points, key, attempt, onGeometry]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const row = data?.measurements.find(m => m.polarization === pol);
  const max = Math.max(1, ...(row?.histogram_counts ?? []));
  return <section className="c-panel-block p-area-inspector" aria-label="Area evidence">
    <p className="c-eyebrow">Area evidence</p><h2>Measure a region</h2>
    <p className="c-hint">Click two opposite corners, or pan and use the centre button for each corner. The amber outline shows the native-grid rectangle actually measured.</p>
    <button className="c-btn" onClick={() => onSelect(center)}>{points.length === 1 ? "Use centre as second corner" : "Start area at map centre"}</button>
    <p role="status">{points.length === 0 ? "Choose the first corner." : points.length === 1 ? "First corner set. Choose the opposite corner." : "Two corners set. Click again to start a new area."}</p>
    {points.length === 2 && !current && <p role="status">Reading native area measurements…</p>}
    {current?.error && <><p role="alert">{current.error}</p><button className="c-btn" onClick={() => setAttempt(n => n+1)}>Retry area</button></>}
    {data?.status === "outside_extent" && <p>Outside the processed window. Select an area within the radar overlay.</p>}
    {data?.geometry && <>
      <p><strong>{data.selected_area_km2.toFixed(4)} km²</strong> selected · {data.selected_pixels.toLocaleString()} pixels</p>
      {data.clipped_to_extent && <p className="p-pixel-empty">Selection clipped to the available raster window.</p>}
      <label>Area polarization <select className="c-select" value={pol} onChange={e => setPol(e.target.value)}><option>HH</option><option>HV</option></select></label>
      {row && <>
        <dl className="c-facts"><div><dt>Valid common area</dt><dd>{row.valid_area_km2.toFixed(4)} km²</dd></div><div><dt>Excluded area</dt><dd>{row.excluded_area_km2.toFixed(4)} km²</dd></div><div><dt>Before median</dt><dd>{num(row.before_median_db)} dB</dd></div><div><dt>After median</dt><dd>{num(row.after_median_db)} dB</dd></div><div><dt>Median pixel change</dt><dd>{num(row.change_median_db)} dB</dd></div></dl>
        {row.valid_pixels ? <><h3>Change distribution</h3><div className="p-histogram" aria-label="Pixel change histogram">{row.histogram_counts.map((n,i) => <div key={i}><span>{data.histogram_labels[i]} dB</span><meter min={0} max={max} value={n} aria-label={`${data.histogram_labels[i]} dB: ${n} pixels`} /><strong>{n.toLocaleString()}</strong></div>)}</div></> : <p className="p-pixel-empty">No common-valid measurements in this area. Missing data is not zero change.</p>}
      </>}
      <p className="c-hint">Exploratory radar evidence, not a detected flood. Medians use the same common-valid pixels; median change can differ from the difference of date medians. HH and HV areas overlap.</p>
      <details><summary>Selection limitations</summary><ul className="p-limitations">{data.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
      <div className="c-links"><button className="c-btn" onClick={() => download(`radar-area-${caseId}.json`,JSON.stringify(data,null,2),"application/json")}>Export area evidence</button><button className="c-btn" onClick={() => download(`radar-area-${caseId}.geojson`,JSON.stringify({type:"Feature",geometry:data.geometry,properties:{...data,geometry:undefined}},null,2),"application/geo+json")}>Export GeoJSON</button></div>
    </>}
  </section>;
}
