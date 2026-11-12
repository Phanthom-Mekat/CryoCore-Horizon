"use client";

import { useEffect, useState } from "react";
import { Crosshair, Download } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

type Measurement = { status: "valid" | "excluded"; before_db: number | null; after_db: number | null; change_db: number | null; reason: string | null };
type Sample = {
  case_id: string; status: "valid" | "excluded" | "outside_extent"; reason?: string;
  requested: { longitude: number; latitude: number };
  pixel: { row: number; column: number; longitude: number; latitude: number; size_m: number[] } | null;
  polarizations: Record<"HHHH" | "HVHV", Measurement>; sources: { acquisition: string }[];
};
const number = (value: number | null) => value === null ? "—" : fmtNum(value, 2);

export function PixelInspector({ caseId, replaying, point, onSelect, center, polarization }: {
  caseId: string; replaying: boolean; point: [number, number] | null; onSelect: (point: [number, number]) => void;
  center: [number, number]; polarization: "HHHH" | "HVHV";
}) {
  const t = useT();
  const px = t.pixel;
  const [result, setResult] = useState<{ key: string; data?: Sample; error?: boolean } | null>(null);
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
      .catch(() => { if (live) setResult({key,error:true}); });
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
  const polName = polarization === "HHHH" ? "HH" : "HV";
  if (replaying) return <section className="c-panel-block p-inspector" aria-label={px.eyebrow}>
    <p className="c-eyebrow"><Crosshair size={14} aria-hidden="true" /> {px.eyebrow}</p>
    <h2>{px.title}</h2>
    <p className="c-hint">{px.frozen}</p>
  </section>;
  return <section className="c-panel-block p-inspector" aria-label={px.eyebrow}>
    <p className="c-eyebrow"><Crosshair size={14} aria-hidden="true" /> {px.eyebrow}</p>
    <h2>{px.title}</h2>
    <p className="c-hint">{px.hint}</p>
    <button className="c-btn" onClick={() => onSelect(center)}>{px.centre}</button>
    <div aria-live="polite" aria-atomic="true">
      {point && <p className="p-pixel-location">{fmtNum(Math.abs(point[1]), 5)}° {px.hemi[point[1] < 0 ? "S" : "N"]} · {fmtNum(Math.abs(point[0]), 5)}° {px.hemi[point[0] < 0 ? "W" : "E"]}</p>}
      {point && !current && <p role="status">{px.reading}</p>}
      {current?.error && <><p role="alert">{px.error}</p><button className="c-btn" onClick={() => { setResult(null); setRetry(n => n+1); }}>{px.retry}</button></>}
      {sample?.status === "outside_extent" && <p className="p-pixel-empty">{px.outside}</p>}
      {sample?.pixel && <>
        <p className="c-hint">{px.native(fmtNum(sample.pixel.row), fmtNum(sample.pixel.column))}</p>
        <table className="p-pixel-table"><caption>{px.caption}</caption><thead><tr><th scope="col">{px.pol}</th><th scope="col">{t.before}</th><th scope="col">{t.after}</th><th scope="col">{px.change}</th></tr></thead><tbody>{(["HHHH","HVHV"] as const).map(pol => { const v = sample.polarizations[pol]; return <tr key={pol} className={pol === polarization ? "is-selected" : undefined}><th scope="row">{pol === "HHHH" ? "HH" : "HV"}</th><td>{number(v.before_db)}</td><td>{number(v.after_db)}</td><td>{number(v.change_db)}</td></tr>; })}</tbody></table>
        {selected?.status === "valid" ? <p className="p-pixel-note">{px.valid(fmtNum(Math.abs(selected.change_db!), 2), selected.change_db! < 0 ? "decrease" : selected.change_db! > 0 ? "increase" : "none", polName)}</p> : <p className="p-pixel-empty">{px.excluded}</p>}
        <p className="c-hint">{px.dates(fmtDate(sample.sources[0].acquisition), fmtDate(sample.sources[1].acquisition))}</p>
      </>}
    </div>
    {sample && <button className="c-btn" onClick={download}><Download size={14} aria-hidden="true" />{px.save}</button>}
  </section>;
}
