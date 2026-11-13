"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileSearch, Map as MapIcon, Pause, Play, RotateCcw } from "lucide-react";
import type { Map as MlMap } from "mapbox-gl";
import { CloudCompare, type CloudPair } from "@/components/CloudCompare";
import { CASE as PASSES, day, localTime } from "@/lib/chattogram/catalog";
import { CASE_ID, layerImage, type Finding, type LayerId } from "@/lib/chattogram/case-api";
import { plainLayer, plainOf } from "@/lib/chattogram/plain";
import { cameraDuration } from "@/lib/mapbox";
import { fmtArea, fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { useCase } from "../CaseProvider";
import { PlainKey, PlainLine } from "../PlainAnswer";
import { PrepStatus } from "../PrepStatus";

// Step 1 reuses the landing page's same-morning MODIS photo vs NISAR radar pairs (same stack as the case).
const PAIRS: CloudPair[] = PASSES.map((p) => ({ key: p.id, day: day(p.start), radarTime: localTime(p.start), radar: p.browse.src, optical: p.optical.src }));
const CLOUDY = Math.max(0, PASSES.findIndex((p) => p.start.startsWith("2026-07-12"))); // a fully overcast morning
const [[W, N], , [E, S]] = PASSES[0].browse.quad;

type StepId = "clouds" | "place" | "before" | "after" | "plain" | "field" | "honest" | "end";
const STEPS: StepId[] = ["clouds", "place", "before", "after", "plain", "field", "honest", "end"];
const LAYER: Partial<Record<StepId, LayerId>> = { before: "before_db", after: "after_db", plain: "plain", field: "plain", honest: "plain", end: "plain" };
const AUTOPLAY_MS = 9000;

const bboxOf = (f: Finding) => {
  // polygons → rings → [lon, lat] points
  const pts = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat(1).flat(1);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as [[number, number], [number, number]];
};

/** The case in eight steps, from "clouds hide the ground" to a plain answer for one field. Made to be followed or recorded. */
export function TourView() {
  const { load, processed } = useCase();
  const t = useT();
  const tt = t.tour;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const map = useRef<MlMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const plainL = plainLayer(pc);
  // the field to open on: the largest finding read as crops or plants grew
  const field = useMemo(
    () => pc?.findings.features.filter((f) => plainOf(pc, f.properties.id) === "plants_grew").sort((a, b) => b.properties.area_km2 - a.properties.area_km2)[0] ?? null,
    [pc],
  );
  const area = pc?.detail.analysis_area.geometry ?? null;
  const areaBox = useMemo(() => {
    if (!area) return null;
    const ring = area.coordinates[0];
    return [[Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1]))], [Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))]] as [[number, number], [number, number]];
  }, [area]);
  const step = STEPS[i];
  const last = STEPS.length - 1;
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(last, n))), [last]);

  // camera: the whole area, or the chosen field
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !areaBox) return;
    m.resize(); // the map was hidden under the cloud comparison on step 1
    const box = step === "field" && field ? bboxOf(field) : areaBox;
    m.fitBounds(box, { padding: step === "field" ? 120 : 30, maxZoom: 14.5, duration: cameraDuration() * 2 });
  }, [step, mapReady, areaBox, field]);

  const autoplay = playing && i < last; // playback ends on the last step by itself
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => go(i + 1), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [autoplay, i, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea, [role=slider]")) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  if (load.status !== "ready") return null;
  if (!pc || !plainL || !area) {
    return (
      <div className="c-tour-empty">
        <h1>{tt.title}</h1>
        <p>{tt.needsCase}</p>
        <PrepStatus compact />
      </div>
    );
  }

  const d = pc.detail;
  const [b, a] = [fmtDate(d.before.date), fmtDate(d.after.date)];
  const days = Math.round((Date.parse(d.after.date) - Date.parse(d.before.date)) / 864e5);
  const grew = plainL.categories?.find((c) => c.id === "plants_grew")?.area_km2 ?? 0;
  const s = tt.steps;
  const copy: Record<StepId, { title: string; body: string }> = {
    // "the morning of": Chattogram's date (UTC+6), as the cloud picture labels it, not the UTC date used elsewhere
    clouds: { title: s.clouds.title, body: s.clouds.body(fmtDate(new Date(Date.parse(PASSES[CLOUDY].start) + 6 * 36e5).toISOString())) },
    place: { title: s.place.title, body: s.place.body(fmtArea(d.metrics?.analysis_km2 ?? 0)) },
    before: { title: s.before.title(b), body: s.before.body },
    after: { title: s.after.title(a), body: s.after.body(fmtNum(days)) },
    plain: { title: s.plain.title, body: s.plain.body(fmtArea(grew)) },
    field: {
      title: s.field.title,
      body: field ? s.field.body(`${fmtNum(field.properties.median_before_db, 1)} dB`, `${fmtNum(field.properties.median_after_db, 1)} dB`) : "",
    },
    honest: { title: s.honest.title, body: s.honest.body },
    end: { title: s.end.title, body: s.end.body },
  };
  const layer = LAYER[step] ? pc.layers.find((l) => l.id === LAYER[step]) : null;
  const overlay = layer ? { ...layerImage(CASE_ID, layer, d.updated_at), label: t.processed.texts[layer.label] ?? layer.label } : null;
  const showField = step === "field" && field;

  return (
    <div className="c-tour">
      <section className="c-tour-stage" aria-label={copy[step].title}>
        <div className="c-tour-map" hidden={step === "clouds"}>
          <CaseMap
            label={copy[step].title}
            view={{ lon: (W + E) / 2, lat: (N + S) / 2, zoom: 10 }}
            image={null}
            processed={overlay}
            imageOpacity={0.92}
            area={pc.detail.analysis_area}
            areaName={d.title}
            boundary={load.data.region.boundary}
            findings={showField ? { type: "FeatureCollection", features: [field] } : null}
            selectedFinding={showField ? field.properties.id : null}
            controls={false}
            allowTerrain={false}
            onReady={(m) => {
              map.current = m;
              setMapReady(true);
            }}
          />
        </div>
        {step === "clouds" && <CloudCompare pairs={PAIRS} aspect={(E - W) / (N - S)} initial={CLOUDY} track={PASSES[0].track} frame={PASSES[0].frame} />}
      </section>

      <aside className="c-tour-card" aria-live="polite">
        <p className="c-eyebrow">{tt.step(fmtNum(i + 1), fmtNum(STEPS.length))}</p>
        <h1>{copy[step].title}</h1>
        <p className="c-tour-body">{copy[step].body}</p>
        {step === "plain" && <PlainKey layer={plainL} before={b} after={a} tapHint={false} />}
        {showField && <PlainLine id="plants_grew" layer={plainL} />}
        {step === "end" && (
          <div className="c-tour-cta">
            <Link className="c-btn is-primary" href="/chattogram/explore">
              <MapIcon size={16} aria-hidden="true" />
              {tt.openMap}
            </Link>
            <Link className="c-btn" href="/chattogram/evidence">
              <FileSearch size={16} aria-hidden="true" />
              {tt.openEvidence}
            </Link>
          </div>
        )}
        <div className="c-tour-dots" aria-hidden="true">
          {STEPS.map((id, n) => (
            <span key={id} className={n === i ? "is-on" : n < i ? "is-done" : undefined} />
          ))}
        </div>
        <div className="c-tour-controls">
          <button type="button" className="c-btn" onClick={() => go(i - 1)} disabled={i === 0}>
            <ArrowLeft size={16} aria-hidden="true" />
            {tt.back}
          </button>
          <button
            type="button"
            className="c-btn"
            onClick={() => {
              if (i === last) go(0);
              setPlaying(i === last || !autoplay);
            }}
            aria-pressed={autoplay}
          >
            {i === last ? <RotateCcw size={16} aria-hidden="true" /> : autoplay ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {i === last ? tt.restart : autoplay ? tt.pause : tt.play}
          </button>
          {i < last && (
            <button type="button" className="c-btn is-primary" onClick={() => go(i + 1)}>
              {tt.next}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="c-hint">{tt.keys}</p>
      </aside>
    </div>
  );
}
