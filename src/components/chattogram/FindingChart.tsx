"use client";

import type { CaseDetail, Finding, Timeseries } from "@/lib/chattogram/case-api";
import { findingChart } from "@/lib/chattogram/finding-chart";
import { fmtDate, fmtDayMonth, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { FINDING } from "./MapKey";

const W = 360;
const PAD = { l: 80, r: 14, t: 12 }; // l fits "১৬ অক্টোবর"
const ROW = 30;
const db = (v: number) => fmtNum(v, 1);

/**
 * The finding's median γ⁰ on each date (dot) against the whole analysis area's mean (tick) and 10th–90th percentile
 * range (band), on one dB axis. Shape, not colour, tells the marks apart; the numbers are in a table below.
 */
export function FindingChart({ finding, detail, timeseries }: { finding: Finding; detail: CaseDetail; timeseries: Timeseries }) {
  const t = useT();
  const c = t.finding.chart;
  const { rows, axis } = findingChart(finding, detail, timeseries);
  const color = FINDING[finding.properties.kind].color;
  const x = (v: number) => PAD.l + ((v - axis.min) / (axis.max - axis.min)) * (W - PAD.l - PAD.r);
  const y = (i: number) => PAD.t + ROW / 2 + i * ROW;
  const base = PAD.t + rows.length * ROW + 4;
  const H = base + 18;

  return (
    <figure className="c-fchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={c.aria(fmtDate(rows[0].date), fmtDate(rows[1].date))}>
        {axis.ticks.map((v) => (
          <g key={v}>
            <line className="c-fchart-grid" x1={x(v)} x2={x(v)} y1={PAD.t} y2={base} />
            <text className="c-fchart-axis" x={x(v)} y={base + 13} textAnchor="middle">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        <text className="c-fchart-axis" x={PAD.l - 16} y={base + 13} textAnchor="end">
          dB
        </text>
        {rows.map((r, i) => {
          const fx = x(r.finding);
          return (
            <g key={r.date}>
              <title>{r.case ? c.tip(fmtDate(r.date), db(r.finding), db(r.case.mean), db(r.case.p10), db(r.case.p90)) : c.tipNoCase(fmtDate(r.date), db(r.finding))}</title>
              <text className="c-fchart-date" x={PAD.l - 8} y={y(i) + 4} textAnchor="end">
                {fmtDayMonth(r.date)}
              </text>
              {r.case && (
                <>
                  <rect className="c-fchart-band" x={x(r.case.p10)} y={y(i) - 5} width={x(r.case.p90) - x(r.case.p10)} height={10} rx={4} />
                  <line className="c-fchart-mean" x1={x(r.case.mean)} x2={x(r.case.mean)} y1={y(i) - 8} y2={y(i) + 8} />
                </>
              )}
              <circle className="c-fchart-dot" cx={fx} cy={y(i)} r={5} style={{ fill: color }} />
              <text className="c-fchart-value" x={fx} y={y(i) - 9} textAnchor={fx < PAD.l + 16 ? "start" : fx > W - PAD.r - 16 ? "end" : "middle"}>
                {db(r.finding)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="c-fchart-key">
        <li>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" style={{ fill: color }} />
          </svg>
          {c.area}
        </li>
        <li>
          <svg width="12" height="12" aria-hidden="true">
            <line className="c-fchart-mean" x1="6" x2="6" y1="0" y2="12" />
          </svg>
          {c.caseMean}
        </li>
        <li>
          <svg width="18" height="12" aria-hidden="true">
            <rect className="c-fchart-band" x="0" y="1" width="18" height="10" rx="4" />
          </svg>
          {c.caseRange}
        </li>
      </ul>
      <details className="c-rain-table">
        <summary>{t.rain.showNumbers}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t.timeline.date}</th>
              <th scope="col">{c.area}</th>
              <th scope="col">{c.caseMean}</th>
              <th scope="col">{c.caseP10}</th>
              <th scope="col">{c.caseP90}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <th scope="row">{fmtDate(r.date)}</th>
                <td>{db(r.finding)}</td>
                {r.case ? (
                  <>
                    <td>{db(r.case.mean)}</td>
                    <td>{db(r.case.p10)}</td>
                    <td>{db(r.case.p90)}</td>
                  </>
                ) : (
                  <td colSpan={3}>{c.noCase}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
