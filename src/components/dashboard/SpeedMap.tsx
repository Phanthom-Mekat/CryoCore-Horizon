"use client";

import { useEffect, useRef, useState } from "react";
import { DATA_ROOT, SERIES_COLORS, UNIT_LABEL, fmtDayShort, rampColor, toGrid, toLonLat, toUnit, type Fronts, type Manifest, type Pair, type SpeedUnit } from "@/lib/dashboard-data";

export type Layers = { speed: boolean; fronts: boolean; probes: boolean };

type Grid = { code: Uint8ClampedArray; ok: Uint8ClampedArray };
const cache = new Map<string, Promise<Grid>>();

/** Decodes a speed PNG (gray = speed, alpha = valid) into arrays. Cached per file. */
function loadGrid(src: string, w: number, h: number) {
  if (!cache.has(src))
    cache.set(
      src,
      new Promise<Grid>((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          const code = new Uint8ClampedArray(w * h);
          const ok = new Uint8ClampedArray(w * h);
          for (let i = 0; i < w * h; i++) {
            code[i] = d[i * 4];
            ok[i] = d[i * 4 + 3] > 0 ? 1 : 0;
          }
          res({ code, ok });
        };
        img.onerror = () => rej(new Error(`could not load ${src}`));
        img.src = DATA_ROOT + src;
      }),
    );
  return cache.get(src)!;
}

export function SpeedMap({ manifest, fronts, pair, layers, units = "mday" }: { manifest: Manifest; fronts: Fronts; pair: Pair; layers: Layers; units?: SpeedUnit }) {
  const { width: W, height: H } = manifest.grid;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    loadGrid(pair.speed, W, H).then(
      (g) => {
        if (!live) return;
        setGrid(g);
        setError(null);
        const ctx = canvas.current!.getContext("2d")!;
        const img = ctx.createImageData(W, H);
        for (let i = 0; i < W * H; i++) {
          if (!g.ok[i]) continue;
          const v = g.code[i] / 255;
          const [r, gg, b] = rampColor(v / 0.75); // 0.75 × max saturates the ramp: most ice is far below max
          img.data.set([r, gg, b, Math.round(255 * 0.92 * Math.min(1, Math.max(0, (v * manifest.speedMax - 0.6) / 5)))], i * 4); // ice slower than ~0.6 m/day stays untinted
        }
        ctx.putImageData(img, 0, 0);
      },
      (e: Error) => live && setError(e.message),
    );
    // warm the cache for neighbouring pairs so stepping feels instant
    const i = manifest.pairs.indexOf(pair);
    for (const j of [i - 1, i + 1]) if (manifest.pairs[j]) loadGrid(manifest.pairs[j].speed, W, H).catch(() => {});
    return () => {
      live = false;
    };
  }, [pair, W, H, manifest]);

  // on narrow screens the map scrolls sideways; start it centred on the first probe (the calving front)
  useEffect(() => {
    const el = scroller.current;
    const p = manifest.probes[0];
    if (!el || !p || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = (toGrid(manifest, p.lon, p.lat)[0] / manifest.grid.width) * el.scrollWidth - el.clientWidth / 2;
  }, [manifest]);

  const endFront = fronts.fronts.find((f) => f.date === pair.end);
  const pts = (line: [number, number][]) => line.map(([lon, lat]) => toGrid(manifest, lon, lat).map((v) => v.toFixed(2)).join(",")).join(" ");
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: Math.min(W - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * W))), y: Math.min(H - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * H))) });
  };
  const value = hover && grid ? (grid.ok[hover.y * W + hover.x] ? (grid.code[hover.y * W + hover.x] / 255) * manifest.speedMax : null) : undefined;
  const [hLon, hLat] = hover ? toLonLat(manifest, hover.x + 0.5, hover.y + 0.5) : [0, 0];

  return (
    <figure className="map">
      <div className="map-scroll" ref={scroller}>
      <div
        className="map-frame"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerMove={(e) => pick(e)}
        onPointerDown={(e) => pick(e)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin raster sized by the frame */}
        <img src={DATA_ROOT + manifest.basemap.src} alt="" className="map-base" />
        <canvas ref={canvas} width={W} height={H} className="map-speed" hidden={!layers.speed} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="map-svg" aria-hidden="true">
          {layers.fronts &&
            fronts.fronts.map((f, i) => (
              <polyline
                key={f.date}
                points={pts(f.line)}
                className="map-front"
                style={{ opacity: 0.2 + (0.5 * i) / fronts.fronts.length }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {layers.fronts && endFront && <polyline points={pts(endFront.line)} className="map-front is-current" vectorEffect="non-scaling-stroke" />}
          {layers.probes && <polyline points={pts(fronts.flowline)} className="map-flow" vectorEffect="non-scaling-stroke" />}
          {hover && <path d={`M${hover.x + 0.5} 0V${H}M0 ${hover.y + 0.5}H${W}`} className="map-cross" vectorEffect="non-scaling-stroke" />}
        </svg>
        {layers.probes &&
          manifest.probes.map((p) => {
            const [gx, gy] = toGrid(manifest, p.lon, p.lat);
            return (
              <span key={p.id} className="map-probe" style={{ left: `${(gx / W) * 100}%`, top: `${(gy / H) * 100}%`, ["--c" as string]: SERIES_COLORS[p.id] ?? "#fff" }}>
                <span>{p.label}</span>
              </span>
            );
          })}
        {layers.fronts && endFront && (
          <span className="map-tag" style={{ left: `${(toGrid(manifest, endFront.line[0][0], endFront.line[0][1])[0] / W) * 100}%`, top: "30%" }}>
            Front, {fmtDayShort(endFront.date)}
          </span>
        )}
        <output className="map-readout" aria-live="off">
          {hover ? (
            <>
              <strong>{value === undefined ? "Loading" : value === null ? "No ice-speed data" : `${toUnit(value, units).toFixed(1)} ${UNIT_LABEL[units]}`}</strong>
              <span>
                {hLat.toFixed(3)}° N, {Math.abs(hLon).toFixed(3)}° W
              </span>
            </>
          ) : (
            <span>Point at the map to read the speed</span>
          )}
        </output>
        {error && <p className="map-error">The speed layer for this pair didn’t load ({error}). Pick another pair or reload the page.</p>}
      </div>
      </div>
      <figcaption>Basemap: {manifest.basemap.caption}.</figcaption>
    </figure>
  );
}
