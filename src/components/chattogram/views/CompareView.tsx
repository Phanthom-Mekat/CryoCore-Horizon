"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Map as MlMap } from "mapbox-gl";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Check, FileSearch } from "lucide-react";
import { compatibility, type Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum, fmtTime } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap, quicklookSrc } from "../CaseMap";
import { CaseBar } from "../CaseBar";
import { RainCard } from "../RainCard";
import { useCase, type View } from "../CaseProvider";

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
  const { load, stack, before, after, view, set, href, source } = useCase();
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
      <p className="c-compare-foot"><Link href="/chattogram/processed">Compare calibrated radar layers →</Link> · The processed pilot has a shared dB scale, coverage masks and downloadable measurements.</p>
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
          <CaseMap allowTerrain={false} label={t.quicklookOf(fmtDate(after.start))} view={view} onMove={onMove} image={after} imageOpacity={1} onReady={ready(1)} controls={false} />
        </div>
        <div className="c-reveal-layer c-reveal-before">
          <CaseMap allowTerrain={false} label={t.quicklookOf(fmtDate(before.start))} view={view} onMove={onMove} image={before} imageOpacity={1} onReady={ready(0)} />
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

      <p className="c-compare-foot">{c.foot}</p>
    </div>
      <RainCard mode="pair" />
    </>
  );
}
