"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { ArrowDownToLine, ArrowUpRight, Layers, ScanLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseRadarState, radarQuery, type RadarMode, type RadarState } from "@/lib/chattogram/processed-state";
import { CaseMap } from "../CaseMap";
import { PixelInspector } from "../PixelInspector";
import { AreaInspector } from "../AreaInspector";
import type { ProcessedCase, ProcessedImage } from "@/lib/chattogram/processed";

type Mode = RadarMode;

export function ProcessedView() {
  const params = useSearchParams();
  return <RadarWorkspace key={params.toString()} initial={parseRadarState(new URLSearchParams(params.toString()))} />;
}

function RadarWorkspace({ initial }: { initial: RadarState }) {
  const [data, setData] = useState<ProcessedCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [corners, setCorners] = useState<ProcessedImage["corners"] | null>(null);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [pol, setPol] = useState<"HHHH" | "HVHV">(initial.polarization);
  const [opacity, setOpacity] = useState(initial.opacity);
  const [split, setSplit] = useState(initial.split);
  const [view, setView] = useState(initial.view);
  const [point, setPoint] = useState<[number, number] | null>(initial.point);
  const [inspectionMode, setInspectionMode] = useState<"pixel" | "area">("pixel");
  const [areaPoints, setAreaPoints] = useState<[number, number][]>([]);
  const [areaGeometry, setAreaGeometry] = useState<GeoJSON.Polygon | null>(null);
  const selectArea = (p: [number, number]) => {
    setAreaGeometry(null);
    setAreaPoints(previous => previous.length === 1 ? [previous[0], p] : [p]);
  };
  const [shareStatus, setShareStatus] = useState("");
  const [shareLink, setShareLink] = useState("");
  const maps = useRef<(MapboxMap | null)[]>([null, null]);
  const syncing = useRef(false);
  const onReady = useCallback((index: number, map: MapboxMap) => {
    maps.current[index] = map;
    map.on("move", () => {
      const other = maps.current[1 - index];
      if (!other || syncing.current) return;
      syncing.current = true;
      other.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
      syncing.current = false;
    });
    map.on("remove", () => { if (maps.current[index] === map) maps.current[index] = null; });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    (async () => {
      if (initial.caseId !== null && !/^[a-f0-9]{24}$/.test(initial.caseId)) throw new Error("This link contains an invalid processed case ID.");
      const response = await fetch("/api/earth/cases", { signal });
      if (!response.ok) throw new Error("Processed data is temporarily unavailable.");
      const payload = await response.json() as { cases: ProcessedCase[] };
      const pilot = initial.caseId ? payload.cases.find(c => c.id === initial.caseId && c.method === "gcov-window-v1") : payload.cases.find(c => c.method === "gcov-window-v1");
      if (!pilot && initial.caseId) throw new Error("The processed case in this link is unavailable. No different case has been substituted.");
      if (!pilot) { setEmpty(true); return; }
      const bounds = await fetch(`/api/earth/cases/${pilot.id}/display/after-HHHH.tif?bounds=true`, { signal });
      if (!bounds.ok) throw new Error("The published map layer is unavailable.");
      setCorners((await bounds.json()).corners);
      setData(pilot);
    })().catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [attempt, initial.caseId]);
  const image = useMemo(() => data && corners ? { url: `/api/earth/cases/${data.id}/display/${mode === "swipe" ? "after" : mode}-${pol}.tif`, corners } : null, [data, corners, mode, pol]);
  const beforeImage = useMemo(() => data && corners ? { url: `/api/earth/cases/${data.id}/display/before-${pol}.tif`, corners } : null, [data, corners, pol]);
  if (error || empty) return <div className="c-state" role="status"><h1>{empty ? "No processed case yet" : "Radar layers unavailable"}</h1><p>{error || "The scene explorer is available while a processed case is being prepared."}</p><div className="c-state-actions"><Link className="c-btn" href="/chattogram/explore">Browse scenes</Link>{error && <button className="c-btn" onClick={() => { setError(null); setAttempt(a => a + 1); }}>Try again</button>}</div></div>;
  if (!data || !image) return <div className="d-state" aria-busy="true"><span className="d-spinner" /><p>Opening calibrated NASA radar layers…</p></div>;
  const stats = data.statistics[pol];
  const date = (index: number) => new Date(data.sources[index].acquisition).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const active = `${mode === "swipe" ? "after" : mode}-${pol}.tif`;
  const share = async () => {
    const url = new URL("/chattogram/processed", window.location.origin);
    url.search = radarQuery({ caseId: data.id, mode, polarization: pol, opacity, split, view, point });
    setShareLink(url.toString());
    try { await navigator.clipboard.writeText(url.toString()); setShareStatus("Link copied. Opens this case, layer, map position and selected pixel in 2D."); }
    catch { setShareStatus("Copy the link below. Opens this case, layer, map position and selected pixel in 2D."); }
  };
  return <>
    <header className="c-bar">
      <div><p className="c-eyebrow">NASA–ISRO NISAR / Calibrated pilot</p><h1>Karnaphuli, in radar</h1><p className="c-bar-meta">{date(0)} → {date(1)} · 20 m pixels · Frequency A</p></div>
      <div className="c-links"><button className="c-btn" onClick={share}>Share radar view</button><Link className="c-btn is-primary" href={`/chattogram/processed/${data.id}/brief`}>Observation brief <ArrowUpRight size={16} /></Link><a className="c-btn" href={`/api/earth/cases/${data.id}/assets/${active}`}><ArrowDownToLine size={16} />Download GeoTIFF</a></div>
    </header>
    {shareLink && <div className="p-share-result"><p role="status">{shareStatus}</p><label>Snapshot link<input aria-label="Radar snapshot link" readOnly value={shareLink} onFocus={e => e.target.select()} /></label><p className="c-hint">This is a snapshot of your view when you pressed Share. Share again after making changes. Recipients need the same published case on their server.</p></div>}
    <div className="p-metrics">
      <div><ScanLine size={18} /><span>Common coverage<strong>{stats.common_area_km2.toFixed(2)} <small>km²</small></strong></span></div>
      <div><Layers size={18} /><span>Median {pol === "HHHH" ? "HH" : "HV"} change<strong>{stats.median_change_db.toFixed(2)} <small>dB</small></strong></span></div>
      <div><ShieldCheck size={18} /><span>Valid common pixels<strong>{stats.common_valid_pixels.toLocaleString()}</strong></span></div>
    </div>
    <div className="p-workspace">
      <section className="p-map-card" aria-label="Processed radar workspace">
        <div className="p-toolbar"><div className="p-segment" aria-label="Radar layer">{(["before", "after", "swipe", "change"] as Mode[]).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "swipe" ? "Compare" : value === "change" ? "Signed change" : value === "before" ? "Before" : "After"}</button>)}</div><select aria-label="Radar polarization" className="c-select" value={pol} onChange={e => setPol(e.target.value as typeof pol)}><option value="HHHH">HH polarization</option><option value="HVHV">HV polarization</option></select></div>
        <div className="p-map-stage">
          <CaseMap key={`${mode === "swipe" ? "swipe-main" : "single"}-${inspectionMode}`} label="Calibrated radar map" onInspect={inspectionMode === "area" ? selectArea : setPoint} inspectionPoint={inspectionMode === "area" ? areaPoints[0] ?? null : point} analysisGeometry={inspectionMode === "area" ? areaGeometry : null} allowTerrain={mode !== "swipe" && inspectionMode !== "area"} view={view} onMove={setView} image={null} processed={image} imageOpacity={opacity} onReady={m => onReady(0, m)} />
          {mode === "swipe" && <><div className="p-swipe-overlay" style={{ clipPath: `inset(0 ${100-split}% 0 0)` }}><CaseMap label="Before radar map" analysisGeometry={inspectionMode === "area" ? areaGeometry : null} inspectionPoint={inspectionMode === "area" ? areaPoints[0] ?? null : point} view={view} onMove={setView} image={null} processed={beforeImage} imageOpacity={opacity} controls={false} onReady={m => onReady(1, m)} /></div><div className="p-swipe-line" style={{ left: `${split}%` }} /><div className="p-date-labels"><span>{date(0)}</span><span>{date(1)}</span></div></>}
          <div className="p-map-stamp"><span className="p-live-dot" />REAL RADAR · EXPERIMENTAL</div>
        </div>
        {mode === "swipe" && <label className="p-slider">Before / after reveal<input aria-label="Before and after reveal" type="range" min="0" max="100" value={split} onChange={e => setSplit(Number(e.target.value))} /><output>{split}%</output></label>}
        <div className="p-map-footer"><div className="p-scale"><div className={mode === "change" ? "p-gradient-change" : "p-gradient-power"} /><div><span>{mode === "change" ? "−6 dB · decrease" : "−25 dB"}</span><span>{mode === "change" ? "+6 dB · increase" : "0 dB"}</span></div><small>{mode === "change" ? "October minus July · values clipped for display" : "Gamma0 backscatter · same scale for both dates"}</small></div><label className="p-opacity">Layer opacity<input type="range" min="0" max="100" value={Math.round(opacity*100)} onChange={e => setOpacity(Number(e.target.value)/100)} /></label></div>
      </section>
      <aside className="c-panel p-evidence" aria-label="Pilot evidence">
        <div className="c-panel-block"><div className="p-segment" aria-label="Inspection mode"><button aria-pressed={inspectionMode === "pixel"} onClick={() => setInspectionMode("pixel")}>Pixel</button><button aria-pressed={inspectionMode === "area"} onClick={() => { setInspectionMode("area"); setMode("change"); }}>Area analysis</button></div>{inspectionMode === "area" && <p className="c-hint">Area selections are exported separately; Share radar view currently restores pixel selections only.</p>}</div>
        {inspectionMode === "pixel" ? <PixelInspector caseId={data.id} point={point} onSelect={setPoint} center={[view.lon, view.lat]} polarization={pol} /> : <AreaInspector caseId={data.id} points={areaPoints} onSelect={selectArea} center={[view.lon, view.lat]} onGeometry={setAreaGeometry} />}
        <div className="c-panel-block"><p className="c-eyebrow">What you are seeing</p><h2>Measured change.<br />Careful interpretation.</h2><p>Real HH/HV radar power, calibrated to dB. {mode === "change" ? "Colour shows how backscatter changed between these dates. It does not identify flooding." : "Before and after share the same brightness scale. Darker pixels have lower backscatter; they are not automatically water."}</p><span className="p-status">Experimental · provisional data</span></div>
        <div className="c-panel-block"><p className="c-label">Coverage & exclusions</p><dl className="c-facts"><div><dt>Inside study area</dt><dd>{stats.common_area_km2.toFixed(2)} km²</dd></div><div><dt>Geographic exclusion</dt><dd>{stats.outside_roi_area_km2.toFixed(2)} km²</dd></div><div><dt>Additional quality exclusions</dt><dd>{stats.excluded_pixels.toLocaleString()} pixels</dd></div></dl><p className="c-hint">Transparent pixels are excluded, not unchanged. The clipped river corridor cannot support a river-water-change claim.</p></div>
        <div className="c-panel-block"><p className="c-label">Read the map responsibly</p><p className="c-hint">3D terrain and buildings provide Mapbox context. Radar colours retain their scale in both views. Use 2D for spatial comparison.</p><details><summary>Method & limitations</summary><p className="c-hint">{data.method} · native aligned grids · valid power and documented masks · no resampling of scientific outputs.</p><ul className="p-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></details></div>
        <div className="c-panel-block"><p className="c-label">Traceable to NASA</p>{data.sources.map((source,index) => <a className="p-source" key={source.concept_id} href={`https://cmr.earthdata.nasa.gov/search/concepts/${source.concept_id}.html`} target="_blank" rel="noreferrer"><span>{date(index)}<small>{source.concept_id}</small></span><ArrowUpRight size={16} /></a>)}<a className="c-btn" href={`/api/earth/cases/${data.id}`} target="_blank" rel="noreferrer">Open evidence manifest <ArrowUpRight size={14} /></a></div>
      </aside>
    </div>
  </>;
}
