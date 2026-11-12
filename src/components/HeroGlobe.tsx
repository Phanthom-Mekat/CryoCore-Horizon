"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Globe, Telemetry } from "@/lib/globe";

const fmtTime = (d: Date) =>
  `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })} UTC`;
const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
const sign = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}°`;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getReduced = () => matchMedia(REDUCED_QUERY).matches;
const getServerReduced = () => true;

type Readout = Telemetry & { sun: number; speed: number };

/** Chase-camera view beside NISAR (three.js, loaded when the browser is idle) plus its flight readout. */
export function HeroGlobe() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const craft = useRef<HTMLDivElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const pausedRef = useRef(false);
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getServerReduced);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState<Readout | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = () =>
      import("@/lib/globe")
        .then(({ mountGlobe, sunElevation, SIM_SPEED, TARGET }) => {
          if (cancelled || !ref.current) return;
          globeRef.current = mountGlobe(ref.current, {
            reduced,
            paused: !reduced && pausedRef.current,
            marker: pin.current,
            craftLabel: craft.current,
            onReadyChange: (r) => {
              if (!cancelled) setReady(r);
            },
            onTick: (x) => {
              if (!cancelled) setT({ ...x, sun: sunElevation(TARGET.lat, TARGET.lon, x.simTime), speed: reduced ? 0 : SIM_SPEED });
            },
          });
        })
        .catch(() => {}); // no WebGL: the poster stays
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 1200 }) : window.setTimeout(start, 200);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      globeRef.current?.dispose();
      globeRef.current = null;
    };
  }, [reduced]);

  const togglePaused = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    globeRef.current?.setPaused(next);
  };

  const inView = Boolean(t?.inSwath);
  const lighting = !t ? "" : t.sun < -6 ? " at night" : t.sun < 0 ? " in twilight" : " in daylight";

  return (
    <>
      <div className={`stage${ready ? " is-ready" : ""}`}>
        <div className="stage-poster" aria-hidden="true" />
        <canvas
          ref={ref}
          role="img"
          aria-label={`View from beside the NISAR spacecraft in orbit 747 km above the Bay of Bengal, with Chattogram below${lighting}. Its radar swath reveals the ground through cloud.`}
        />
        <div ref={craft} className="callout callout-craft" data-edge="left" aria-hidden="true">
          <span className="callout-origin" />
          <span className="callout-tag">
            <strong>NISAR</strong>
            <small>12 m L/S-band</small>
          </span>
        </div>
        <div ref={pin} className="callout callout-pin" data-edge="left" aria-hidden="true">
          <span className="callout-reticle" />
          <span className="callout-tag">
            <strong>Chattogram</strong>
            <small>22.3° N, 91.8° E</small>
          </span>
        </div>
      </div>
      <dl className="hud">
        <div>
          <dt>Simulated pass{t?.speed ? (paused ? ", paused" : `, ${t.speed}× speed`) : ""}</dt>
          <dd className="hud-pass">
            <span>{t ? fmtTime(t.simTime) : "Acquiring"}</span>
            {!reduced && (
              <button
                type="button"
                className="hud-toggle"
                aria-pressed={paused}
                aria-label={paused ? "Play orbit simulation" : "Pause orbit simulation"}
                onClick={togglePaused}
              >
                <svg viewBox="0 0 10 10" width="9" height="9" fill="currentColor" aria-hidden="true">
                  {paused ? <path d="M2 1.2 8.5 5 2 8.8Z" /> : <path d="M1.8 1.5h2.2v7H1.8Zm4.2 0h2.2v7H6Z" />}
                </svg>
                <span>{paused ? "Play" : "Pause"}</span>
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Sun at Chattogram</dt>
          <dd>{t ? `${sign(t.sun)} ${t.sun < -6 ? "dark" : t.sun < 0 ? "twilight" : "daylight"}` : "–"}</dd>
        </div>
        <div>
          <dt>Slant range to Chattogram</dt>
          <dd className={inView ? "is-live" : undefined}>
            {inView && <span className="hud-dot" aria-hidden="true" />}
            {t ? `${Math.round(t.toTargetKm).toLocaleString("en-GB")} km${inView ? ", in the swath" : ""}` : "–"}
          </dd>
        </div>
        <div>
          <dt>Ground track</dt>
          <dd>{t ? `${fmtLat(t.satLat)} ${fmtLon(t.satLon)}` : "–"}</dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>747 km</dd>
        </div>
      </dl>
    </>
  );
}
