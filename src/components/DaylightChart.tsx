"use client";

import { useId, useState, useSyncExternalStore, type KeyboardEvent } from "react";

// Day length at Ilulissat (69.2° N) from 2026 local-noon solar declination with standard refraction (−0.833°).
const LAT = 69.2;
function dayLength(doy: number) {
  const r = Math.PI / 180;
  // Days since J2000.0 at Ilulissat solar noon (~15:24 UTC) for day `doy` of 2026.
  const d = Date.UTC(2026, 0, 1 + doy, 15, 24) / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * r;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r;
  const e = (23.439 - 0.00000036 * d) * r;
  const sinDecl = Math.sin(e) * Math.sin(L);
  const cosDecl = Math.sqrt(1 - sinDecl * sinDecl);
  const cosH = (Math.sin(-0.833 * r) - Math.sin(LAT * r) * sinDecl) / (Math.cos(LAT * r) * cosDecl);
  if (cosH >= 1) return 0;
  if (cosH <= -1) return 24;
  return (2 * Math.acos(cosH)) / r / 15;
}
const DAYS = Array.from({ length: 365 }, (_, d) => dayLength(d));
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const W = 730;
const H = 200;
const x = (d: number) => (d / 364) * W;
const y = (h: number) => H - (h / 24) * H;
const AREA = `M0 ${H} ` + DAYS.map((h, d) => `L${x(d).toFixed(1)} ${y(h).toFixed(1)}`).join(" ") + ` L${W} ${H}Z`;
const LINE = "M" + DAYS.map((h, d) => `${x(d).toFixed(1)} ${y(h).toFixed(1)}`).join(" L");
const label = (d: number) => {
  const m = MONTH_START.findLastIndex((s) => s <= d);
  return `${d - MONTH_START[m] + 1} ${MONTHS[m]}`;
};
const hours = (h: number) => (h === 0 ? "no sunrise" : h === 24 ? "sun never sets" : `${h.toFixed(1)} h of daylight`);
const tipHours = (h: number) =>
  h === 0 ? "Polar night · 0 h" : h === 24 ? "Midnight sun · 24 h" : `${h.toFixed(1)} h daylight`;
// polar night: the run of zero-daylight days around new year
const nightStart = DAYS.findIndex((h, d) => d > 180 && h === 0);
const nightEnd = DAYS.findIndex((h) => h > 0);
// midnight sun: contiguous 24-hour daylight around summer solstice
const sunStart = DAYS.findIndex((h) => h === 24);
const sunEnd = DAYS.findLastIndex((h) => h === 24);

const noSubscribe = () => () => {};
const dayOfYear = () => {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const isLeap = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const doy = Math.floor((now.getTime() - Date.UTC(yr, 0, 1)) / 86400000);
  // Collapse leap day onto index 58 (28 Feb) so Mar-Dec stay aligned with non-leap MONTH_START.
  return Math.max(0, Math.min(364, isLeap && doy >= 59 ? doy - 1 : doy));
};

export function DaylightChart() {
  const uid = useId();
  const gradId = `${uid}-area`;
  const today = useSyncExternalStore(noSubscribe, dayOfYear, () => null); // client-only: the static page has no "today"
  const [selected, setSelected] = useState<number | null>(null);
  const [announcePointer, setAnnouncePointer] = useState(false);
  const focus = selected ?? today;
  const readout = focus === null ? " " : `${focus === today && selected === null ? "Today" : label(focus)}: ${hours(DAYS[focus])}`;
  const focusRatio = focus === null ? 0 : x(focus) / W;

  const scrubAt = (svg: SVGSVGElement, clientX: number) => {
    const r = svg.getBoundingClientRect();
    if (r.width <= 0) return;
    const day = Math.max(0, Math.min(364, Math.round(((clientX - r.left) / r.width) * 364)));
    setSelected(day);
    setAnnouncePointer(true);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = focus ?? 0;
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, cur - 1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(364, cur + 1);
        break;
      case "PageDown":
        next = Math.max(0, cur - 30);
        break;
      case "PageUp":
        next = Math.min(364, cur + 30);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 364;
        break;
      case "Escape":
        setSelected(null);
        setAnnouncePointer(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    setAnnouncePointer(false);
    setSelected(next);
  };

  return (
    <figure className="daylight">
      <figcaption>
        <strong>Hours of daylight at Ilulissat through the year</strong>
        <span className="daylight-read">{readout}</span>
        <span className="sr-only" aria-live="polite">
          {announcePointer && selected !== null ? `${label(selected)}: ${hours(DAYS[selected])}` : ""}
        </span>
      </figcaption>
      <div className="daylight-plot">
        <svg
          viewBox={`0 -26 ${W} ${H + 76}`}
          className="daylight-svg"
          role="slider"
          tabIndex={0}
          aria-label="Inspect daylight hours by day of year at Ilulissat"
          aria-valuemin={1}
          aria-valuemax={365}
          aria-valuenow={(focus ?? 0) + 1}
          aria-valuetext={focus === null ? "Select a day of the year" : `${label(focus)}: ${hours(DAYS[focus])}`}
          onPointerDown={(e) => scrubAt(e.currentTarget, e.clientX)}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" || e.buttons > 0) scrubAt(e.currentTarget, e.clientX);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") {
              setSelected(null);
              setAnnouncePointer(false);
            }
          }}
          onKeyDown={onKeyDown}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fe3ff" stopOpacity="0.28" />
              <stop offset="65%" stopColor="#8fe3ff" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#8fe3ff" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <g aria-hidden="true">
            {[6, 12, 18, 24].map((h) => (
              <g key={h}>
                <line className="dl-grid" x1="0" x2={W} y1={y(h)} y2={y(h)} />
                <text className="dl-axis" x={W} y={y(h) - 4} textAnchor="end">{h} h</text>
              </g>
            ))}
            {MONTH_START.slice(1).map((d) => (
              <line key={d} className="dl-grid dl-grid-v" x1={x(d)} x2={x(d)} y1="0" y2={H} />
            ))}
            <rect className="dl-night" x={x(nightStart)} y="0" width={W - x(nightStart)} height={H} />
            <rect className="dl-night" x="0" y="0" width={x(nightEnd)} height={H} />
            {sunStart >= 0 && sunEnd >= sunStart && (
              <rect className="dl-sun" x={x(sunStart)} y="0" width={x(sunEnd) - x(sunStart)} height={H} />
            )}
            {[nightEnd, sunStart, sunEnd, nightStart].map((d) =>
              d >= 0 ? <line key={d} className="dl-thresh" x1={x(d)} x2={x(d)} y1="0" y2={H} /> : null
            )}
            <text className="dl-axis dl-night-label" x={W - 6} y={H - 10} textAnchor="end">Polar night</text>
            {sunStart >= 0 && sunEnd >= sunStart && (
              <text className="dl-axis dl-sun-label" x={(x(sunStart) + x(sunEnd)) / 2} y={28} textAnchor="middle">
                Midnight sun
              </text>
            )}
            <path className="dl-area" d={AREA} style={{ fill: `url(#${gradId})` }} />
            <path className="dl-line" d={LINE} />
            <line className="dl-base" x1="0" x2={W} y1={H} y2={H} />
            {MONTHS.map((m, i) => (
              <text key={m} className="dl-axis" x={x(MONTH_START[i] + 15)} y={H + 18} textAnchor="middle">{m}</text>
            ))}
            {/* NISAR: at least two looks every 12 days, in any light */}
            {Array.from({ length: 61 }, (_, i) => (
              <line key={i} className="dl-pass" x1={x(i * 6)} x2={x(i * 6)} y1={H + 34} y2={H + 46} />
            ))}
            {focus !== null && (
              <g>
                <line className="dl-proj" x1={x(focus)} x2={W} y1={y(DAYS[focus])} y2={y(DAYS[focus])} />
                <line className="dl-cursor" x1={x(focus)} x2={x(focus)} y1="0" y2={H} />
                <circle className="dl-dot-halo" cx={x(focus)} cy={y(DAYS[focus])} r="9" />
                <circle className="dl-dot" cx={x(focus)} cy={y(DAYS[focus])} r="5" />
              </g>
            )}
          </g>
        </svg>
        {focus !== null && (
          <div
            className="dl-tip"
            style={{
              left: `${(focusRatio * 100).toFixed(2)}%`,
              translate: `${(-focusRatio * 100).toFixed(2)}% 0`,
            }}
            aria-hidden="true"
          >
            <strong>{label(focus)}</strong>
            {focus === today && <span className="dl-tip-today">TODAY</span>}
            <span className="dl-tip-val">{tipHours(DAYS[focus])}</span>
            <span className="dl-tip-radar">NISAR 2+/12 d</span>
          </div>
        )}
      </div>
      <p className="daylight-key">
        <span className="dl-key-pass" aria-hidden="true" /> NISAR radar looks at the glacier at least twice every 12 days, in daylight or darkness.
      </p>
      <div className="sr-only">
        <table>
        <caption>Hours of daylight at Ilulissat on the 15th of each month</caption>
        <tbody>
          {MONTHS.map((m, i) => (
            <tr key={m}>
              <th scope="row">{m}</th>
              <td>{DAYS[MONTH_START[i] + 14].toFixed(1)} hours</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </figure>
  );
}
