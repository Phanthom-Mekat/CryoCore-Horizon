"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { ArrowDownToLine, ArrowUpRight, Layers, ScanLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { areaQuery, parseRadarState, radarQuery, type RadarMode, type RadarState } from "@/lib/chattogram/processed-state";
import { CaseMap } from "../CaseMap";
import { PixelInspector } from "../PixelInspector";
import { AreaInspector } from "../AreaInspector";
import { pilotOf, type ProcessedCase, type ProcessedImage } from "@/lib/chattogram/processed";
import type { FrozenPilot } from "@/lib/chattogram/frozen";
import { useCase } from "../CaseProvider";
import { fmtDate, fmtDayMonth, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import type { Messages } from "@/lib/i18n/messages";
import { BackendText } from "../BackendText";

type Mode = RadarMode;
/** Why the processed case couldn't open: a key of `processed.errors`, shown in the interface language. */
type LoadError = keyof Messages["processed"]["errors"];
class CaseLoadError extends Error {
  constructor(readonly key: LoadError) { super(key); }
}
/** A case file by its path after /api/earth/cases/{id}/: live from the backend, or its copy in the snapshot while replaying. */
const caseFile = (frozen: FrozenPilot | null, id: string, path: string) => (frozen ? (frozen.files[path]?.src ?? "") : `/api/earth/cases/${id}/${path}`);

export function ProcessedView() {
  const params = useSearchParams();
  return <RadarWorkspace key={params.toString()} initial={parseRadarState(new URLSearchParams(params.toString()))} />;
}

function RadarWorkspace({ initial }: { initial: RadarState }) {
  const t = useT();
  const p = t.processed;
  const { load, source, frozenPilot, href } = useCase();
  const deciding = load.status === "loading"; // live or replay isn't known until the case source is chosen
  const replaying = source.mode === "frozen";
  const fp = replaying ? frozenPilot : null;
  const [liveData, setData] = useState<ProcessedCase | null>(null);
  const [liveError, setError] = useState<{ key: LoadError; detail?: string } | null>(null);
  const [liveEmpty, setEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [liveCorners, setCorners] = useState<ProcessedImage["corners"] | null>(null);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [pol, setPol] = useState<"HHHH" | "HVHV">(initial.polarization);
  const [opacity, setOpacity] = useState(initial.opacity);
  const [split, setSplit] = useState(initial.split);
  const [view, setView] = useState(initial.view);
  const [point, setPoint] = useState<[number, number] | null>(initial.point);
  const [inspectionMode, setInspectionMode] = useState<"pixel" | "area">(initial.area ? "area" : "pixel");
  const [areaPoints, setAreaPoints] = useState<[number, number][]>(initial.area ?? []);
  const [areaGeometry, setAreaGeometry] = useState<GeoJSON.Polygon | null>(null);
  const selectArea = (p: [number, number]) => {
    setAreaGeometry(null);
    setAreaPoints(previous => previous.length === 1 ? [previous[0], p] : [p]);
  };
  const [shareCopied, setShareCopied] = useState(false);
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
    if (replaying || deciding) return; // the snapshot has everything; no live request while replaying
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    (async () => {
      if (initial.caseId !== null && !/^[a-f0-9]{24}$/.test(initial.caseId)) throw new CaseLoadError("badId");
      const response = await fetch("/api/earth/cases", { signal });
      if (!response.ok) throw new CaseLoadError("unavailable");
      const payload = await response.json() as { cases: ProcessedCase[] };
      const pilot = initial.caseId ? pilotOf(payload.cases.filter(c => c.id === initial.caseId)) : pilotOf(payload.cases);
      if (!pilot && initial.caseId) throw new CaseLoadError("caseMissing");
      if (!pilot) { setEmpty(true); return; }
      const bounds = await fetch(`/api/earth/cases/${pilot.id}/display/after-HHHH.tif?bounds=true`, { signal });
      if (!bounds.ok) throw new CaseLoadError("layerMissing");
      setCorners((await bounds.json()).corners);
      setData(pilot);
    })().catch(e => { if (!controller.signal.aborted) setError(e instanceof CaseLoadError ? { key: e.key } : { key: "unavailable", detail: e instanceof Error ? e.message : String(e) }); });
    return () => controller.abort();
  }, [attempt, replaying, deciding, initial.caseId]);
  const data = replaying ? (frozenPilot?.case ?? null) : liveData;
  const corners = replaying ? (frozenPilot?.corners ?? null) : liveCorners;
  const empty = replaying ? !frozenPilot : liveEmpty;
  const error = !replaying && liveError !== null;
  const area = inspectionMode === "area" && !replaying; // area statistics need the backend's rasters too
  const image = useMemo(() => data && corners ? { url: caseFile(fp, data.id, `display/${mode === "swipe" ? "after" : mode}-${pol}.tif`), corners } : null, [fp, data, corners, mode, pol]);
  const beforeImage = useMemo(() => data && corners ? { url: caseFile(fp, data.id, `display/before-${pol}.tif`), corners } : null, [fp, data, corners, pol]);
  const inspected = replaying ? null : area ? areaPoints[0] ?? null : point; // pixel values come from the backend's rasters, which a replay does not have
  if (deciding) return <div className="d-state" aria-busy="true"><span className="d-spinner" /><p>{p.loading}</p></div>;
  if (error || empty) return <div className="c-state" role="status"><h1>{empty ? p.noCase : p.unavailable}</h1><p>{error ? p.unavailableBody : p.noCaseBody}</p>{error && liveError && initial.caseId && <p className="c-hint">{p.errors[liveError.key]}{liveError.detail && <> <span lang="en" translate="no">({liveError.detail})</span></>}</p>}<div className="c-state-actions"><Link className="c-btn" href={href("/chattogram/explore")}>{p.browse}</Link>{error && <button className="c-btn" onClick={() => { setError(null); setAttempt(a => a + 1); }}>{t.gate.tryAgain}</button>}</div></div>;
  if (!data || !image) return <div className="d-state" aria-busy="true"><span className="d-spinner" /><p>{p.loading}</p></div>;
  const stats = data.statistics[pol];
  const date = (index: number) => fmtDate(data.sources[index].acquisition);
  const polName = pol === "HHHH" ? "HH" : "HV";
  const active = `${mode === "swipe" ? "after" : mode}-${pol}.tif`;
  // a complete area selection travels with the share link and the report link
  const sharedArea = area && areaPoints.length === 2 ? ([areaPoints[0], areaPoints[1]] as [[number, number], [number, number]]) : null;
  const reportHref = `/chattogram/processed/${data.id}/brief${sharedArea ? `?${areaQuery(sharedArea)}` : ""}`;
  const share = async () => {
    const url = new URL("/chattogram/processed", window.location.origin);
    url.search = radarQuery({ caseId: data.id, mode, polarization: pol, opacity, split, view, point, area: sharedArea });
    try { await navigator.clipboard.writeText(url.toString()); setShareCopied(true); }
    catch { setShareCopied(false); }
    setShareLink(url.toString()); // after the copy attempt, so the box never flashes the wrong status
  };
  return <>
    <header className="c-bar">
      <div><p className="c-eyebrow">{p.eyebrow}</p><h1>{p.title}</h1><p className="c-bar-meta">{p.meta(date(0), date(1))}</p></div>
      <div className="c-links">
        {!replaying && <><button className="c-btn" onClick={share}>{p.share}</button><Link className="c-btn is-primary" href={reportHref}>{p.briefLink} <ArrowUpRight size={16} /></Link></>}
        <a className="c-btn" href={caseFile(fp, data.id, `assets/${active}`)} download={fp ? active : undefined}><ArrowDownToLine size={16} />{p.download}</a>
      </div>
    </header>
    {shareLink && <div className="p-share-result"><p role="status">{shareCopied ? p.shareCopied : p.shareCopy}</p><label>{p.shareLink}<input aria-label={p.shareLinkLabel} readOnly value={shareLink} onFocus={e => e.target.select()} /></label><p className="c-hint">{p.shareHint}</p></div>}
    <div className="p-metrics">
      <div><ScanLine size={18} /><span>{p.coverage}<strong>{fmtNum(stats.common_area_km2, 2)} <small>km²</small></strong></span></div>
      <div><Layers size={18} /><span>{p.median(polName)}<strong>{fmtSigned(stats.median_change_db)} <small>dB</small></strong></span></div>
      <div><ShieldCheck size={18} /><span>{p.validPixels}<strong>{fmtNum(stats.common_valid_pixels)}</strong></span></div>
    </div>
    <div className="p-workspace">
      <section className="p-map-card" aria-label={p.workspace}>
        <div className="p-toolbar"><div className="p-segment" aria-label={p.layer}>{(["before", "after", "swipe", "change"] as Mode[]).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{p.modes[value]}</button>)}</div><select aria-label={p.polarization} className="c-select" value={pol} onChange={e => setPol(e.target.value as typeof pol)}><option value="HHHH">{p.polOption("HH")}</option><option value="HVHV">{p.polOption("HV")}</option></select></div>
        <div className="p-map-stage">
          <CaseMap key={`${mode === "swipe" ? "swipe-main" : "single"}-${inspectionMode}`} label={p.mapMain} onInspect={replaying ? undefined : area ? selectArea : setPoint} inspectionPoint={inspected} analysisGeometry={area ? areaGeometry : null} allowTerrain={mode !== "swipe" && !area} view={view} onMove={setView} image={null} processed={image} imageOpacity={opacity} onReady={m => onReady(0, m)} />
          {mode === "swipe" && <><div className="p-swipe-overlay" style={{ clipPath: `inset(0 ${100-split}% 0 0)` }}><CaseMap label={p.mapBefore} analysisGeometry={area ? areaGeometry : null} inspectionPoint={inspected} view={view} onMove={setView} image={null} processed={beforeImage} imageOpacity={opacity} controls={false} onReady={m => onReady(1, m)} /></div><div className="p-swipe-line" style={{ left: `${split}%` }} /><div className="p-date-labels"><span>{date(0)}</span><span>{date(1)}</span></div></>}
          <div className="p-map-stamp"><span className="p-live-dot" />{p.stamp}</div>
        </div>
        {mode === "swipe" && <label className="p-slider">{p.reveal}<input aria-label={p.revealLabel} type="range" min="0" max="100" value={split} onChange={e => setSplit(Number(e.target.value))} /><output>{fmtNum(split)}%</output></label>}
        <div className="p-map-footer"><div className="p-scale"><div className={mode === "change" ? "p-gradient-change" : "p-gradient-power"} /><div><span>{mode === "change" ? p.changeLow : `${fmtNum(-25)} dB`}</span><span>{mode === "change" ? p.changeHigh : `${fmtNum(0)} dB`}</span></div><small>{mode === "change" ? p.changeNote(fmtDayMonth(data.sources[1].acquisition), fmtDayMonth(data.sources[0].acquisition)) : p.powerNote}</small></div><label className="p-opacity">{p.opacity}<input type="range" min="0" max="100" value={Math.round(opacity*100)} onChange={e => setOpacity(Number(e.target.value)/100)} /></label></div>
      </section>
      <aside className="c-panel p-evidence" aria-label={p.evidence}>
        {!replaying && <div className="c-panel-block"><div className="p-segment" aria-label={p.inspection}><button aria-pressed={!area} onClick={() => setInspectionMode("pixel")}>{p.inspectPixel}</button><button aria-pressed={area} onClick={() => { setInspectionMode("area"); setMode("change"); }}>{p.inspectArea}</button></div>{area && <p className="c-hint">{p.areaShareHint}</p>}</div>}
        {area ? <AreaInspector caseId={data.id} points={areaPoints} onSelect={selectArea} center={[view.lon, view.lat]} onGeometry={setAreaGeometry} /> : <PixelInspector caseId={data.id} replaying={replaying} point={inspected} onSelect={setPoint} center={[view.lon, view.lat]} polarization={pol} />}
        <div className="c-panel-block"><p className="c-eyebrow">{p.seeing}</p><h2>{p.headA}<br />{p.headB}</h2><p>{p.body} {mode === "change" ? p.changeBody : p.powerBody}</p><span className="p-status">{p.status}</span></div>
        <div className="c-panel-block"><p className="c-label">{p.coverageLabel}</p><dl className="c-facts"><div><dt>{p.inside}</dt><dd>{fmtNum(stats.common_area_km2, 2)} km²</dd></div><div><dt>{p.geographic}</dt><dd>{fmtNum(stats.outside_roi_area_km2, 2)} km²</dd></div><div><dt>{p.quality}</dt><dd>{p.pixels(fmtNum(stats.excluded_pixels))}</dd></div></dl><p className="c-hint">{p.coverageHint}</p></div>
        <div className="c-panel-block"><p className="c-label">{p.responsibly}</p><p className="c-hint">{p.responsiblyHint}</p><details><summary>{p.method}</summary><p className="c-hint">{p.methodBody(data.method)}</p><p className="c-hint">{p.limits}</p><ul className="p-limitations">{data.limitations.map(item => <li key={item}><BackendText text={item} translated={p.texts[item]} /></li>)}</ul></details></div>
        <div className="c-panel-block"><p className="c-label">{p.traceable}</p>{data.sources.map((source,index) => <a className="p-source" key={source.concept_id} href={`https://cmr.earthdata.nasa.gov/search/concepts/${source.concept_id}.html`} target="_blank" rel="noreferrer"><span>{date(index)}<small lang="en" translate="no">{source.concept_id}</small></span><ArrowUpRight size={16} /></a>)}{!replaying && <a className="c-btn" href={`/api/earth/cases/${data.id}`} target="_blank" rel="noreferrer">{p.manifest} <ArrowUpRight size={14} /></a>}</div>
      </aside>
    </div>
  </>;
}
