"use client";

import { useMemo, useState, type PointerEvent } from "react";
import type { RainSeries } from "@/lib/chattogram/rain";
import { fmtDate, fmtDayMonth, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

const W = 760;
const H = 170;
const PAD = { l: 38, r: 10, t: 18, b: 26 };

export type RainMark = { day: string; label?: string; strong?: boolean };

/**
 * Daily rainfall as thin bars on a true time axis, with NISAR pass dates as vertical markers (plan F13). One series, so
 * one hue and no legend box; hover reads a day; the numbers are in a table below for screen readers and checking.
 */
export function RainChart({ series, from, to, marks, label }: { series: RainSeries; from: string; to: string; marks: RainMark[]; label: string }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => series.days.filter((d) => d.date >= from && d.date <= to), [series, from, to]);
  if (!days.length) return null;

  const t0 = Date.parse(days[0].date);
  const t1 = Date.parse(days.at(-1)!.date) + 864e5;
  const x = (iso: string) => PAD.l + ((Date.parse(iso) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const bw = Math.max(1, (W - PAD.l - PAD.r) / days.length - 1); // 1px surface gap between days
  const max = Math.max(10, ...days.map((d) => d.mm ?? 0));
  const step = max > 120 ? 50 : max > 60 ? 25 : 10;
  const top = Math.ceil(max / step) * step;
  const y = (mm: number) => PAD.t + (1 - mm / top) * (H - PAD.t - PAD.b);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const months = days.filter((d) => d.date.endsWith("-01"));
  const passByDay = new Map(marks.map((m) => [m.day, m]));
  const h = hover === null ? null : days[hover];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor(((px - PAD.l) / (W - PAD.l - PAD.r)) * days.length);
    setHover(i >= 0 && i < days.length ? i : null);
  };

  return (
    <figure className="c-rain">
      {/* on phones the plot keeps a readable width and scrolls sideways inside its own box */}
      <div className="c-rain-plot">
        <div className="c-rain-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line className="c-rain-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
                <text className="c-rain-axis" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
                  {fmtNum(v)}
                </text>
              </g>
            ))}
            {months.map((d) => (
              <text key={d.date} className="c-rain-axis" x={x(d.date) + 3} y={H - 8}>
                {fmtDayMonth(d.date).replace(/^\S+\s/, "") /* "1 Jul" → "Jul", "১ জুলাই" → "জুলাই" */}
              </text>
            ))}
            {days.map((d, i) =>
              d.mm === null ? (
                <rect key={d.date} className="c-rain-missing" x={x(d.date)} y={H - PAD.b - 3} width={bw} height={3} />
              ) : d.mm > 0 ? (
                <rect
                  key={d.date}
                  className={`c-rain-bar${hover === i ? " is-hover" : ""}`}
                  x={x(d.date)}
                  y={y(d.mm)}
                  width={bw}
                  height={Math.max(1, H - PAD.b - y(d.mm))}
                  rx={Math.min(2, bw / 2)}
                />
              ) : null,
            )}
            {marks.map((m) => (
              <g key={m.day} className={`c-rain-pass${m.strong ? " is-strong" : ""}`}>
                <line x1={x(m.day) + bw / 2} x2={x(m.day) + bw / 2} y1={PAD.t - 6} y2={H - PAD.b} />
                {m.label && (
                  <text x={x(m.day) + bw / 2} y={PAD.t - 8} textAnchor="middle">
                    {m.label}
                  </text>
                )}
              </g>
            ))}
            <line className="c-rain-base" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
            {h && <line className="c-rain-cursor" x1={x(h.date) + bw / 2} x2={x(h.date) + bw / 2} y1={PAD.t} y2={H - PAD.b} />}
          </svg>
          {h && (
            <div
              className="c-rain-tip"
              style={{
                left: `${(x(h.date) / W) * 100}%`,
                translate: x(h.date) / W > 0.7 ? "-100% 0" : "8px 0",
              }}
              aria-hidden="true"
            >
              <strong>{fmtDate(h.date)}</strong>
              <span>{h.mm === null ? t.rain.noValue : `${fmtNum(h.mm, 1)} ${t.rain.unit}`}</span>
              {passByDay.has(h.date) && <span className="c-rain-tip-pass">{t.rain.passOn}</span>}
            </div>
          )}
        </div>
      </div>
      <details className="c-rain-table">
        <summary>{t.rain.showNumbers}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t.rain.date}</th>
              <th scope="col">{t.rain.unitLong}</th>
              <th scope="col">NISAR</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row">{fmtDate(d.date)}</th>
                <td>{d.mm === null ? "–" : fmtNum(d.mm, 1)}</td>
                <td>{passByDay.get(d.date)?.label ?? (passByDay.has(d.date) ? t.rain.pass : "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
