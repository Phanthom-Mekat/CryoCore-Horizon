"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Map as MlMap } from "mapbox-gl";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Check, FileSearch } from "lucide-react";
import { compatibility, type Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum, fmtTime } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap, quicklookSrc } from "../CaseMap";
import { CASE_ID, fmtDb, layerImage } from "@/lib/chattogram/case-api";
import { BackendText } from "../BackendText";
import { CaseBar } from "../CaseBar";
import { RainCard } from "../RainCard";
import { useCase, type View } from "../CaseProvider";
import { DbKey } from "../MapKey";

/** Keeps two maps on the same centre and zoom, so both sides of the divider always show the same extent and scale. */
function useSyncedMaps() {
  const maps = useRef<(MlMap | null)[]>([null, null]);
  const busy = useRef(false);
  return useCallback((i: 0 | 1) => (m: MlMap) => {
    maps.current[i] = m;
    m.on("move", () => {
      const other = maps.current[1 - i];
      if (busy.current || !other) return;
      busy.current = true;
      other.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() });
      busy.current = false;
    });
  }, []);
}

export function CompareView() {
  const { load, stack, before, after, view, set, href, source, processed, isCasePair, caseHref } = useCase();
  const t = useT();
  const c = t.compare;
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ready = useSyncedMaps();
  const onMove = useCallback((v: View) => set({ view: v }), [set]);

  // preload both quicklooks so the reveal never waits mid-drag
  useEffect(() => {
    for (const a of [before, after]) if (a && (a.frozen || source.mode === "live")) fetch(quicklookSrc(a)).catch(() => {});
  }, [before, after, source.mode]);

  if (load.status !== "ready" || !stack || !before || !after) return null;
  if (stack.items.length < 2)
    return (
      <div className="c-state">
        <h2>{c.oneDateTitle}</h2>
        <p>{c.oneDateBody}</p>
      </div>
    );

  // the processed case's pair gets its calibrated layers instead of the quicklooks; any other pair keeps the quicklooks
  const detail = processed.status === "ready" ? processed.data.detail : null;
  const pc = detail?.status === "ready" && processed.status === "ready" ? processed.data : null;
  const lb = pc?.layers.find((l) => l.id === "before_db");
  const la = pc?.layers.find((l) => l.id === "after_db");
  const calibrated = isCasePair && lb && la ? { before: lb, after: la } : null;
  const sameScale = calibrated && calibrated.before.scale.min === calibrated.after.scale.min && calibrated.before.scale.max === calibrated.after.scale.max;
  const toCase = pc && !isCasePair ? caseHref("/chattogram/compare") : null;
  // the area name is drawn by the map in WebGL, which can't shape Bengali, so it stays as the backend writes it
  const areaName = detail ? `${detail.title} · analysis area` : undefined;

  const dates = [...stack.items].sort((a, b) => a.start.localeCompare(b.start));
  const checks = compatibility(before, after);
  const issues = checks.filter((c) => !c.ok);
  const days = Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5);
  const g = stack.items[0];
  const num = (v: number | null) => (v === null ? "–" : fmtNum(v));
  const drag = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const option = (a: Acquisition) => (
    <option key={a.conceptId} value={a.day}>
      {fmtDate(a.start)}
    </option>
  );

  return (
    <>
      <CaseBar
        title={c.title}
        actions={
          <Link className="c-btn" href={href("/chattogram/evidence")}>
            <FileSearch size={16} aria-hidden="true" />
            {c.evidence}
          </Link>
        }
      />
      <p className="c-compare-foot"><Link href="/chattogram/processed">{c.pilotLink}</Link> · {c.pilotNote}</p>
    <div className="c-compare">
      <div className="c-compare-bar">
        <label className="c-field">
          <span className="c-label">{t.before}</span>
          <select className="c-select" value={before.day} onChange={(e) => set({ a: e.target.value })}>
            {dates.map(option)}
          </select>
        </label>
        <button type="button" className="c-btn c-swap" onClick={() => set({ a: after.day, b: before.day })} aria-label={c.swap}>
          <ArrowLeftRight size={16} aria-hidden="true" />
        </button>
        <label className="c-field">
          <span className="c-label">{t.after}</span>
          <select className="c-select" value={after.day} onChange={(e) => set({ b: e.target.value })}>
            {dates.map(option)}
          </select>
        </label>
        <p className="c-compare-gap">
          <strong>{c.gapDays(fmtNum(Math.abs(days)))}</strong>
          {c.gapRest(num(g.track), num(g.frame), t.direction[g.direction])}
          {days < 0 && <em>{c.reversed}</em>}
        </p>
      </div>

      <div className="c-reveal" ref={frame} style={{ "--pos": `${pos}%` } as CSSProperties}>
        <div className="c-reveal-layer">
          <CaseMap
            allowTerrain={false}
            label={calibrated ? c.calibratedOf(fmtDate(after.start)) : t.quicklookOf(fmtDate(after.start))}
            view={view}
            onMove={onMove}
            image={calibrated ? null : after}
            processed={calibrated && layerImage(CASE_ID, calibrated.after, pc!.detail.updated_at)}
            area={detail?.analysis_area ?? null}
            areaName={areaName}
            imageOpacity={1}
            onReady={ready(1)}
            controls={false}
          />
        </div>
        <div className="c-reveal-layer c-reveal-before">
          <CaseMap
            allowTerrain={false}
            label={calibrated ? c.calibratedOf(fmtDate(before.start)) : t.quicklookOf(fmtDate(before.start))}
            view={view}
            onMove={onMove}
            image={calibrated ? null : before}
            processed={calibrated && layerImage(CASE_ID, calibrated.before, pc!.detail.updated_at)}
            area={detail?.analysis_area ?? null}
            areaName={areaName}
            imageOpacity={1}
            onReady={ready(0)}
          />
        </div>
        <span className="c-badge c-badge-l">
          <strong>{t.before}</strong> {fmtDate(before.start)} · {fmtTime(before.start)}
        </span>
        <span className="c-badge c-badge-r">
          <strong>{t.after}</strong> {fmtDate(after.start)} · {fmtTime(after.start)}
        </span>
        <div
          className="c-divider"
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => dragging.current && drag(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          <span className="c-divider-grip" aria-hidden="true">
            <ArrowLeftRight size={18} />
          </span>
          <input
            type="range"
            className="c-divider-input"
            min={0}
            max={100}
            value={Math.round(pos)}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label={c.reveal(fmtDate(before.start), fmtDate(after.start))}
            aria-valuetext={`${fmtNum(Math.round(pos))}% ${fmtDate(before.start)}`}
          />
        </div>
      </div>

      <div className={`c-checks${issues.length ? " is-warn" : ""}`} role="status">
        <p className="c-checks-head">
          {issues.length ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          {issues.length ? c.care(issues.length, fmtNum(issues.length)) : c.ok}
        </p>
        <ul>
          {checks.map((k) => (
            <li key={k.key} className={k.ok ? "is-ok" : "is-diff"}>
              <span aria-hidden="true">{k.ok ? "✓" : "≠"}</span> {t.checks[k.key].label}
              {!k.ok && <small>{k.detail}</small>}
            </li>
          ))}
        </ul>
      </div>

      {calibrated ? (
        <div className="c-compare-foot">
          <p>
            <strong>{c.calibratedTitle}</strong>{" "}
            {sameScale
              ? c.calibratedSame(calibrated.before.units, fmtDb(calibrated.before.scale.min), fmtDb(calibrated.before.scale.max))
              : c.calibratedDiffer(calibrated.before.units)}{" "}
            {c.noData} <BackendText text={calibrated.before.crs_note} translated={t.processed.texts[calibrated.before.crs_note]} />
          </p>
          <DbKey min={calibrated.before.scale.min} max={calibrated.before.scale.max} />
        </div>
      ) : (
        <p className="c-compare-foot">
          {c.foot}
          {toCase && pc && (
            <>
              {" "}
              {c.casePair(fmtDate(pc.detail.before.date), fmtDate(pc.detail.after.date), <Link key="pair" href={toCase}>{c.casePairLink}</Link>)}
            </>
          )}
        </p>
      )}
    </div>
      <RainCard mode="pair" />
    </>
  );
}
