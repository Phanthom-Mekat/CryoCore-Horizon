"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Map as MlMap } from "maplibre-gl";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Check, FileSearch } from "lucide-react";
import { compatibility, fmtDate, fmtTime, type Acquisition } from "@/lib/chattogram/acquisitions";
import { CASE_ID, assetUrl, fmtDb, type CaseLayer } from "@/lib/chattogram/case-api";
import { CaseMap, browseUrl, type Overlay } from "../CaseMap";
import { CaseBar } from "../CaseBar";
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
      other.jumpTo({ center: m.getCenter(), zoom: m.getZoom() });
      busy.current = false;
    });
  }, []);
}

export function CompareView() {
  const { load, stack, before, after, view, set, href, processed, isCasePair, caseHref } = useCase();
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

  // the processed case's pair gets its calibrated layers instead of the quicklooks; any other pair keeps the quicklooks
  const detail = processed.status === "ready" ? processed.data.detail : null;
  const pc = detail?.status === "ready" && processed.status === "ready" ? processed.data : null;
  const lb = pc?.layers.find((l) => l.id === "before_db");
  const la = pc?.layers.find((l) => l.id === "after_db");
  const calibrated = isCasePair && lb && la ? { before: lb, after: la } : null;
  const sameScale = calibrated && calibrated.before.scale.min === calibrated.after.scale.min && calibrated.before.scale.max === calibrated.after.scale.max;
  const overlay = (l: CaseLayer): Overlay => ({ url: assetUrl(CASE_ID, l, pc!.detail.updated_at), corners: l.corners, label: l.label });
  const toCase = pc && !isCasePair ? caseHref("/chattogram/compare") : null;
  const kind = calibrated ? "Calibrated γ⁰" : "NISAR quicklook";

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
          <CaseMap
            label={`${kind} of ${fmtDate(after.start)}`}
            view={view}
            onMove={onMove}
            image={calibrated ? null : after}
            overlay={calibrated && overlay(calibrated.after)}
            area={detail?.analysis_area ?? null}
            areaName={detail ? `${detail.title} · analysis area` : undefined}
            imageOpacity={1}
            onReady={ready(1)}
            controls={false}
          />
        </div>
        <div className="c-reveal-layer c-reveal-before">
          <CaseMap
            label={`${kind} of ${fmtDate(before.start)}`}
            view={view}
            onMove={onMove}
            image={calibrated ? null : before}
            overlay={calibrated && overlay(calibrated.before)}
            area={detail?.analysis_area ?? null}
            areaName={detail ? `${detail.title} · analysis area` : undefined}
            imageOpacity={1}
            onReady={ready(0)}
          />
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

      {calibrated ? (
        <div className="c-compare-foot">
          <p>
            <strong>Calibrated layers.</strong> This is the processed case’s pair, so both sides show calibrated backscatter (γ⁰, {calibrated.before.units}) computed
            from the full GCOV files, clipped to the analysis rectangle, on the same map extent and{" "}
            {sameScale
              ? `one shared contrast scale (${fmtDb(calibrated.before.scale.min)} to ${fmtDb(calibrated.before.scale.max)}). Darker is a weaker return, such as smooth water.`
              : "contrast scales that differ between the two dates, so compare brightness with care."}{" "}
            No-data pixels are transparent. {calibrated.before.crs_note}
          </p>
          <DbKey min={calibrated.before.scale.min} max={calibrated.before.scale.max} />
        </div>
      ) : (
        <p className="c-compare-foot">
          Both sides are NISAR GCOV browse quicklooks (colour composite of polarizations) from ASF, on the same map extent and scale. Dark is smooth surface such as
          open water; bright is rough or vegetated ground. These pictures are for looking, not measuring: a measured change map needs the calibrated γ⁰ layers.
          {toCase && pc && (
            <>
              {" "}
              Calibrated layers exist for the processed pair, {fmtDate(pc.detail.before.date)} → {fmtDate(pc.detail.after.date)}:{" "}
              <Link href={toCase}>compare that pair</Link>.
            </>
          )}
        </p>
      )}
    </div>
    </>
  );
}
