"use client";

import { useState } from "react";
import { fmtDay, fmtDayShort } from "@/lib/dashboard-data";

export type Series = { id: string; label: string; color: string; values: (number | null)[]; area?: boolean };

const W = 640;
const H = 240;
const PAD = { l: 40, r: 96, t: 12, b: 28 };

/**
 * Small time-series chart: thin lines, recessive grid, crosshair + tooltip on hover,
 * click or arrow keys to select a date. Series are direct-labelled at their last value.
 */
export function LineChart({
  dates,
  series,
  unit,
  selected,
  onSelect,
  format = (v) => v.toFixed(1),
  zeroLine = false,
  ariaLabel,
}: {
  dates: Date[];
  series: Series[];
  unit: string;
  selected: number;
  onSelect: (i: number) => void;
  format?: (v: number) => string;
  zeroLine?: boolean;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = Math.min(...all, zeroLine ? 0 : Infinity);
  const hi = Math.max(...all);
  const step = niceStep((hi - lo) / 4);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.ceil(hi / step) * step;
  const t0 = dates[0].getTime();
  const t1 = dates[dates.length - 1].getTime();
  const x = (i: number) => PAD.l + ((dates[i].getTime() - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const ticks = Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step);
  const months = monthTicks(dates[0], dates[dates.length - 1]);
  const focus = hover ?? selected;

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < dates.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  };
  const path = (vals: (number | null)[]) =>
    vals.reduce((d, v, i) => (v === null ? d : d + `${d === "" || vals[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`), "");

  return (
    <div className="lc">
      {series.length > 1 && (
        <ul className="lc-legend">
          {series.map((s) => (
            <li key={s.id}>
              <i style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="lc-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={dates.length - 1}
          aria-valuenow={selected}
          aria-valuetext={`${fmtDay(dates[selected])}: ${series.map((s) => `${s.label} ${s.values[selected] === null ? "no data" : format(s.values[selected]!) + " " + unit}`).join(", ")}`}
          onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onSelect(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onSelect(Math.max(0, selected - 1));
            else if (e.key === "ArrowRight") onSelect(Math.min(dates.length - 1, selected + 1));
            else return;
            e.preventDefault();
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 && zeroLine ? "lc-zero" : "lc-grid"} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="lc-axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">
                {format(t).replace(/\.0$/, "")}
              </text>
            </g>
          ))}
          {months.map((m) => {
            const mx = PAD.l + ((m.getTime() - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
            return (
              <text key={m.getTime()} className="lc-axis" x={mx} y={H - 8} textAnchor="middle">
                {m.getUTCMonth() === 0 ? m.getUTCFullYear() : m.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
              </text>
            );
          })}
          <line className="lc-selected" x1={x(selected)} x2={x(selected)} y1={PAD.t} y2={H - PAD.b} />
          {hover !== null && hover !== selected && <line className="lc-cursor" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />}
          {series.map((s) => {
            const lastI = s.values.findLastIndex((v) => v !== null);
            return (
              <g key={s.id}>
                {s.area && <path d={`${path(s.values)}L${x(lastI).toFixed(1)} ${H - PAD.b}L${x(s.values.findIndex((v) => v !== null)).toFixed(1)} ${H - PAD.b}Z`} fill={s.color} opacity="0.16" />}
                <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
                {s.values[focus] !== null && <circle cx={x(focus)} cy={y(s.values[focus]!)} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />}
                {lastI >= 0 && (
                  <text className="lc-label" x={x(lastI) + 8} y={y(s.values[lastI]!) + 4}>
                    {series.length > 1 ? s.label : ""}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div
          className="lc-tip"
          style={{ left: `${(x(focus) / W) * 100}%`, translate: x(focus) / W > 0.66 ? "-100% 0" : x(focus) / W < 0.2 ? "0 0" : "-50% 0" }}
          aria-hidden="true"
        >
          <strong>{fmtDayShort(dates[focus])}</strong>
          {series.map((s) => (
            <span key={s.id}>
              {series.length > 1 && <i style={{ background: s.color }} />}
              {s.values[focus] === null ? "no data" : `${format(s.values[focus]!)} ${unit}`}
            </span>
          ))}
        </div>
      </div>
      <details className="lc-table">
        <summary>Show the numbers</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {series.map((s) => (
                <th scope="col" key={s.id}>
                  {s.label} ({unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d, i) => (
              <tr key={i}>
                <th scope="row">{fmtDay(d)}</th>
                {series.map((s) => (
                  <td key={s.id}>{s.values[i] === null ? "–" : format(s.values[i]!)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function monthTicks(a: Date, b: Date) {
  const out: Date[] = [];
  const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
  while (d <= b) {
    out.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 2);
  }
  return out;
}
