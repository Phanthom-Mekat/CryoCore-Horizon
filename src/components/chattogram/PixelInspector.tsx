"use client";

import { useEffect, useState } from "react";
import { Crosshair, Download } from "lucide-react";

type Measurement = { status: "valid" | "excluded"; before_db: number | null; after_db: number | null; change_db: number | null; reason: string | null };
type Sample = {
  case_id: string; status: "valid" | "excluded" | "outside_extent"; reason?: string;
  requested: { longitude: number; latitude: number };
  pixel: { row: number; column: number; longitude: number; latitude: number; size_m: number[] } | null;
  polarizations: Record<"HHHH" | "HVHV", Measurement>; sources: { acquisition: string }[];
};
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function PixelInspector({ caseId, point, onSelect, center, polarization }: {
  caseId: string; point: [number, number] | null; onSelect: (point: [number, number]) => void;
  center: [number, number]; polarization: "HHHH" | "HVHV";
}) {
  const [result, setResult] = useState<{ key: string; data?: Sample; error?: string } | null>(null);
  const key = point ? `${caseId}/${point.join(",")}` : "";
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!point) return;
    let live = true;
    const controller = new AbortController();
    fetch(`/api/earth/cases/${caseId}/sample?${new URLSearchParams({longitude:String(point[0]),latitude:String(point[1])})}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    }).then(async r => {
      if (!r.ok) throw new Error("This pixel could not be read. Try again.");
      return r.json() as Promise<Sample>;
    }).then(data => { if (live) setResult({key,data}); })
      .catch(() => { if (live) setResult({key,error:"This pixel could not be read. Try again."}); });
    return () => { live = false; controller.abort(); };
  }, [caseId, point, key, retry]);
  const current = result?.key === key ? result : null;
  const sample = current?.data;
  const selected = sample?.polarizations[polarization];
  const download = () => {
    if (!sample) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(sample,null,2)],{type:"application/json"}));
    const a = document.createElement("a"); a.href=url; a.download=`radar-pixel-${sample.pixel?.row ?? "outside"}-${sample.pixel?.column ?? "extent"}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  return <section className="c-panel-block p-inspector" aria-label="Pixel evidence">
    <p className="c-eyebrow"><Crosshair size={14} aria-hidden="true" /> Pixel evidence</p>
    <h2>Inspect the measurement</h2>
    <p className="c-hint">Click the map, or pan with the map’s keyboard controls and inspect its centre. Values come from the native GeoTIFF pixels.</p>
    <button className="c-btn" onClick={() => onSelect(center)}>Inspect map centre</button>
    <div aria-live="polite" aria-atomic="true">
      {point && <p className="p-pixel-location">{Math.abs(point[1]).toFixed(5)}° {point[1] < 0 ? "S" : "N"} · {Math.abs(point[0]).toFixed(5)}° {point[0] < 0 ? "W" : "E"}</p>}
      {point && !current && <p role="status">Reading native pixel…</p>}
      {current?.error && <><p role="alert">{current.error}</p><button className="c-btn" onClick={() => { setResult(null); setRetry(n => n+1); }}>Retry pixel</button></>}
      {sample?.status === "outside_extent" && <p className="p-pixel-empty">Outside the processed window. Choose a point inside the radar overlay.</p>}
      {sample?.pixel && <>
        <p className="c-hint">20 m native pixel · row {sample.pixel.row}, column {sample.pixel.column}. No interpolation.</p>
        <table className="p-pixel-table"><caption>Backscatter and signed change (dB)</caption><thead><tr><th scope="col">Pol.</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th></tr></thead><tbody>{(["HHHH","HVHV"] as const).map(pol => { const v = sample.polarizations[pol]; return <tr key={pol} className={pol === polarization ? "is-selected" : undefined}><th scope="row">{pol === "HHHH" ? "HH" : "HV"}</th><td>{number(v.before_db)}</td><td>{number(v.after_db)}</td><td>{number(v.change_db)}</td></tr>; })}</tbody></table>
        {selected?.status === "valid" ? <p className="p-pixel-note">{Math.abs(selected.change_db!).toFixed(2)} dB {selected.change_db! < 0 ? "decrease" : selected.change_db! > 0 ? "increase" : "change"} in {polarization === "HHHH" ? "HH" : "HV"} backscatter. This alone does not establish flooding or its cause.</p> : <p className="p-pixel-empty">Excluded pixel. No common-valid change value is available. The saved masks do not distinguish geographic clipping from every quality exclusion at this point.</p>}
        <p className="c-hint">Before: {sample.sources[0].acquisition.slice(0,10)} · After: {sample.sources[1].acquisition.slice(0,10)}. Values may exceed the colour legend’s display range.</p>
      </>}
    </div>
    {sample && <button className="c-btn" onClick={download}><Download size={14} aria-hidden="true" />Save pixel evidence</button>}
  </section>;
}
