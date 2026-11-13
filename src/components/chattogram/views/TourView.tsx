"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, FileSearch, Map as MapIcon, Maximize, Minimize, Pause, Play, RotateCcw } from "lucide-react";
import type { Map as MlMap } from "mapbox-gl";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CompareSlider } from "@/components/CompareSlider";
import { CASE as PASSES } from "@/lib/chattogram/catalog";
import { CASE_ID, layerImage, type Finding, type LayerId } from "@/lib/chattogram/case-api";
import { columnsOf, plainLayer, plainOf } from "@/lib/chattogram/plain";
import { cameraDuration } from "@/lib/mapbox";
import { fmtArea, fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { useCase } from "../CaseProvider";
import { PlainKey } from "../PlainAnswer";
import { PrepStatus } from "../PrepStatus";

const CLOUDY = PASSES.find((p) => p.start.startsWith("2026-07-12")) ?? PASSES[0];
const [[W, N], , [E, S]] = PASSES[0].browse.quad;

type StepId = "clouds" | "place" | "compare" | "plain" | "field" | "honest" | "end";
const STEPS: StepId[] = ["clouds", "place", "compare", "plain", "field", "honest", "end"];
const LAYER: Partial<Record<StepId, LayerId>> = { plain: "plain", field: "plain", honest: "plain", end: "plain" };
const AUTOPLAY_MS = 14000;
// Camera per map step: tilted and turned a little each time, so every step reads as a new shot in a recording.
const CAMERA: Partial<Record<StepId, { pitch: number; bearing: number }>> = {
  place: { pitch: 45, bearing: -15 },
  plain: { pitch: 58, bearing: -30 },
  field: { pitch: 62, bearing: 25 },
  honest: { pitch: 50, bearing: -45 },
  end: { pitch: 45, bearing: -10 },
};
const COLUMNS: StepId[] = ["plain", "field", "honest", "end"];
const ORBIT: StepId[] = ["plain", "field", "end"];

const bboxOf = (f: Finding) => {
  // polygons → rings → [lon, lat] points
  const pts = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat(1).flat(1);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as [[number, number], [number, number]];
};

/** Lead with the public question, then show one measured change and a way to check it. */
export function TourView() {
  const { load, processed, source, caseHref, href } = useCase();
  const t = useT();
  const tt = t.tour;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cleanView, setCleanView] = useState(false);
  const map = useRef<MlMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const plainL = plainLayer(pc);
  const columns = useMemo(() => columnsOf(pc), [pc]);
  // Use the largest plant-like candidate and keep its interpretation tentative.
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
  const showSwipe = step === "clouds" || step === "compare";
  const beforeLayer = pc?.layers.find(l => l.id === "before_db");
  const afterLayer = pc?.layers.find(l => l.id === "after_db");
  const last = STEPS.length - 1;
  const go = useCallback((n: number) => setI(Math.max(0, Math.min(last, n))), [last]);

  // camera: the whole area, or the chosen field
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !areaBox || showSwipe) return;
    m.resize(); // the map was hidden under the cloud comparison on step 1
    const box = step === "field" && field ? bboxOf(field) : areaBox;
    const cam = CAMERA[step] ?? { pitch: 0, bearing: 0 };
    m.fitBounds(box, { padding: step === "field" ? 120 : 30, maxZoom: 14.5, ...cam, duration: cameraDuration() * 3 });
  }, [step, showSwipe, mapReady, areaBox, field, cleanView]);

  const autoplay = playing && i < last; // playback ends on the last step by itself
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => go(i + 1), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [autoplay, i, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest("input, select, textarea, canvas, [role=slider]")) return;
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
  const dateSpan = tt.dateSpan(b, a);
  const s = tt.steps;
  const copy: Record<StepId, { title: string; body: string }> = {
    // "the morning of": Chattogram's date (UTC+6), as the cloud picture labels it, not the UTC date used elsewhere
    clouds: { title: s.clouds.title, body: s.clouds.body },
    place: { title: s.place.title, body: s.place.body(fmtArea(d.metrics?.analysis_km2 ?? 0)) },
    compare: { title: s.compare.title, body: s.compare.body },
    plain: { title: s.plain.title, body: s.plain.body },
    field: {
      title: s.field.title,
      body: field ? s.field.body : s.field.unavailable,
    },
    honest: { title: s.honest.title, body: s.honest.body },
    end: { title: s.end.title, body: s.end.body },
  };
  const layer = LAYER[step] ? pc.layers.find((l) => l.id === LAYER[step]) : null;
  const overlay = layer ? { ...layerImage(CASE_ID, layer, d.updated_at), label: t.processed.texts[layer.label] ?? layer.label } : null;
  const showField = step === "field" && field;
  const destination = (path: string, withFinding: boolean) => {
    const url = new URL(caseHref(path) ?? href(path), "https://example.invalid");
    if (field && withFinding) {
      url.searchParams.set("f", field.properties.id);
      const [[west, south], [east, north]] = bboxOf(field);
      url.searchParams.set("v", `${(west + east) / 2},${(south + north) / 2},13.5`);
    } else {
      url.searchParams.delete("f");
    }
    return url.pathname + url.search;
  };
  const cloudyDate = fmtDate(new Date(Date.parse(CLOUDY.start) + 6 * 36e5).toISOString());
  const swipes = beforeLayer && afterLayer && {
    before: layerImage(CASE_ID, beforeLayer, d.updated_at).url,
    after: layerImage(CASE_ID, afterLayer, d.updated_at).url,
  };

  return (
    <div className={`c-tour${cleanView ? " is-clean" : ""}`}>
      <section className="c-tour-stage" aria-label={copy[step].title}>
        <div className="c-tour-map" hidden={showSwipe}>
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
            threeD
            columns={COLUMNS.includes(step) ? columns : null}
            orbit={ORBIT.includes(step)}
            onReady={(m) => {
              map.current = m;
              setMapReady(true);
            }}
          />
        </div>
        {step === "clouds" && (
          <figure className="c-tour-swipe">
            <CompareSlider
              before={<Image src={CLOUDY.optical.src} alt="" fill sizes="(max-width: 1100px) 100vw, 900px" />}
              after={<Image src={CLOUDY.browse.src} alt="" fill sizes="(max-width: 1100px) 100vw, 900px" />}
              beforeLabel={tt.camera}
              afterLabel={tt.radar}
            />
            <figcaption>{tt.cloudCredit(cloudyDate)}</figcaption>
          </figure>
        )}
        {step === "compare" && (
          <figure className="c-tour-swipe">
            {swipes ? (
              <CompareSlider
                before={<Image src={swipes.before} alt="" unoptimized fill sizes="(max-width: 1100px) 100vw, 900px" />}
                after={<Image src={swipes.after} alt="" unoptimized fill sizes="(max-width: 1100px) 100vw, 900px" />}
                beforeLabel={`${t.before} · ${b}`}
                afterLabel={`${t.after} · ${a}`}
              />
            ) : <p className="c-hint">{tt.compareUnavailable}</p>}
            <figcaption>{tt.compareCredit}</figcaption>
          </figure>
        )}
      </section>

      <aside className="c-tour-card" aria-live="polite">
        <div className="c-tour-top">
          <p className="c-eyebrow">{tt.step(fmtNum(i + 1), fmtNum(STEPS.length))}</p>
          <button type="button" className="c-btn" aria-pressed={cleanView} onClick={() => setCleanView(v => !v)}>
            {cleanView ? <Minimize size={15} aria-hidden="true" /> : <Maximize size={15} aria-hidden="true" />}
            {cleanView ? tt.exitClean : tt.clean}
          </button>
        </div>
        <MotionConfig reducedMotion="user">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="c-tour-copy"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <h1>{copy[step].title}</h1>
              <p className="c-tour-body">{copy[step].body}</p>
            </motion.div>
          </AnimatePresence>
        </MotionConfig>
        {!["clouds", "place"].includes(step) && <p className="c-hint">{dateSpan}</p>}
        {cleanView && source.mode === "frozen" && <p className="c-hint">{tt.recorded}</p>}
        {step === "plain" && <PlainKey layer={plainL} before={b} after={a} tapHint={false} />}
        {showField && (
          <details>
            <summary>{tt.measurements}</summary>
            <p className="c-hint">{s.field.measure(fmtArea(field.properties.area_km2), fmtNum(field.properties.median_before_db, 1), fmtNum(field.properties.median_after_db, 1))}</p>
          </details>
        )}
        {step === "end" && (
          <div className="c-tour-cta">
            <Link className="c-btn is-primary" href={destination("/chattogram/explore", true)}>
              <MapIcon size={16} aria-hidden="true" />
              {tt.openMap}
            </Link>
            <Link className="c-btn" href={destination("/chattogram/evidence", true)}>
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
