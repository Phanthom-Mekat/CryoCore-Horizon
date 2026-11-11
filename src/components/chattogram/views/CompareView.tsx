"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Map as MlMap } from "maplibre-gl";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Check, FileSearch } from "lucide-react";
import { compatibility, fmtDate, fmtTime, type Acquisition } from "@/lib/chattogram/acquisitions";
import { CaseMap, browseUrl } from "../CaseMap";
import { CaseBar } from "../CaseBar";
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
      other.jumpTo({ center: m.getCenter(), zoom: m.getZoom() });
      busy.current = false;
    });
  }, []);
}

export function CompareView() {
  const { load, stack, before, after, view, set, href } = useCase();
  const [pos, setPos] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ready = useSyncedMaps();
  const onMove = useCallback((v: View) => set({ view: v }), [set]);

  // preload both quicklooks so the reveal never waits mid-drag
  useEffect(() => {
    for (const a of [before, after]) if (a) fetch(browseUrl(a)).catch(() => {});
  }, [before, after]);

  if (load.status !== "ready" || !stack || !before || !after) return null;
  if (stack.items.length < 2)
    return (
      <div className="c-state">
        <h2>This stack has only one date</h2>
        <p>A comparison needs two acquisitions from the same track and frame. Pick another stack under Explore.</p>
      </div>
    );

  const dates = [...stack.items].sort((a, b) => a.start.localeCompare(b.start));
  const checks = compatibility(before, after);
  const issues = checks.filter((c) => !c.ok);
  const days = Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5);
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
        title="Compare two dates"
        actions={
          <Link className="c-btn" href={href("/chattogram/evidence")}>
            <FileSearch size={16} aria-hidden="true" />
            Evidence for this pair
          </Link>
        }
      />
    <div className="c-compare">
      <div className="c-compare-bar">
        <label className="c-field">
          <span className="c-label">Before</span>
          <select className="c-select" value={before.day} onChange={(e) => set({ a: e.target.value })}>
            {dates.map(option)}
          </select>
        </label>
        <button type="button" className="c-btn c-swap" onClick={() => set({ a: after.day, b: before.day })} aria-label="Swap before and after">
          <ArrowLeftRight size={16} aria-hidden="true" />
        </button>
        <label className="c-field">
          <span className="c-label">After</span>
          <select className="c-select" value={after.day} onChange={(e) => set({ b: e.target.value })}>
            {dates.map(option)}
          </select>
        </label>
        <p className="c-compare-gap">
          <strong>{Math.abs(days)} days</strong> apart · same track {stack.items[0].track}, frame {stack.items[0].frame}, {stack.items[0].direction.toLowerCase()} pass
          {days < 0 && <em> · “before” is later than “after”</em>}
        </p>
      </div>

      <div className="c-reveal" ref={frame} style={{ "--pos": `${pos}%` } as CSSProperties}>
        <div className="c-reveal-layer">
          <CaseMap label={`NISAR quicklook of ${fmtDate(after.start)}`} view={view} onMove={onMove} image={after} imageOpacity={1} onReady={ready(1)} controls={false} />
        </div>
        <div className="c-reveal-layer c-reveal-before">
          <CaseMap label={`NISAR quicklook of ${fmtDate(before.start)}`} view={view} onMove={onMove} image={before} imageOpacity={1} onReady={ready(0)} />
        </div>
        <span className="c-badge c-badge-l">
          <strong>Before</strong> {fmtDate(before.start)} · {fmtTime(before.start)}
        </span>
        <span className="c-badge c-badge-r">
          <strong>After</strong> {fmtDate(after.start)} · {fmtTime(after.start)}
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
            aria-label={`Reveal: left of the divider shows ${fmtDate(before.start)}, right shows ${fmtDate(after.start)}`}
            aria-valuetext={`${Math.round(pos)}% ${fmtDate(before.start)}`}
          />
        </div>
      </div>

      <div className={`c-checks${issues.length ? " is-warn" : ""}`} role="status">
        <p className="c-checks-head">
          {issues.length ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          {issues.length
            ? `Compare with care: ${issues.length} difference${issues.length > 1 ? "s" : ""} in how these two dates were acquired or processed.`
            : "Comparable: these two dates match on every acquisition and processing check."}
        </p>
        <ul>
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "is-ok" : "is-diff"}>
              <span aria-hidden="true">{c.ok ? "✓" : "≠"}</span> {c.label}
              {!c.ok && <small>{c.detail}</small>}
            </li>
          ))}
        </ul>
      </div>

      <p className="c-compare-foot">
        Both sides are NISAR GCOV browse quicklooks (colour composite of polarizations) from ASF, on the same map extent and scale. Dark is smooth surface such as
        open water; bright is rough or vegetated ground. These pictures are for looking, not measuring: a measured change map needs the calibrated γ⁰ layers.
      </p>
    </div>
    </>
  );
}
