"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Acquisition } from "@/lib/chattogram/acquisitions";
import type { Timeseries } from "@/lib/chattogram/case-api";
import { fmtDate, fmtDayMonth, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { browseUrl, quicklookSrc } from "./CaseMap";
import { useCase } from "./CaseProvider";

const FRAME_MS = 1400;

/**
 * Actual acquisition dates on a true time axis, so gaps stay visible. Play steps through them in order;
 * nothing is interpolated between dates. With `summary`, processed per-date values sit on the same axis below.
 */
export function Timeline({
  items,
  current,
  onPick,
  marks = {},
  summary,
}: {
  items: Acquisition[];
  current: string | null;
  onPick: (a: Acquisition) => void;
  marks?: Record<string, string>;
  summary?: Timeseries["points"];
}) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.start.localeCompare(b.start)), [items]);
  const [playing, setPlaying] = useState(false);
  const replaying = useCase().source.mode === "frozen";
  const t = useT();
  const idx = Math.max(0, sorted.findIndex((a) => a.conceptId === current));
  const t0 = Date.parse(sorted[0]?.start ?? "");
  const t1 = Date.parse(sorted.at(-1)?.start ?? "");
  const pos = (a: Acquisition) => (t1 > t0 ? ((Date.parse(a.start) - t0) / (t1 - t0)) * 100 : 50);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (idx >= sorted.length - 1 ? setPlaying(false) : onPick(sorted[idx + 1])), FRAME_MS);
    return () => clearTimeout(t);
  }, [playing, idx, sorted, onPick]);

  // the next frame first, then the rest of the stack one at a time, so replay and date changes come from cache
  useEffect(() => {
    let live = true;
    const order = [sorted[idx + 1], ...sorted].filter(Boolean);
    (async () => {
      for (const a of order) {
        if (!live) return;
        // frozen quicklooks are static files with stored corners; only live ones need the proxy for both
        if (a.frozen) await fetch(a.frozen.src).catch(() => {});
        else if (!replaying) await Promise.all([fetch(browseUrl(a, "bounds")), fetch(quicklookSrc(a))]).catch(() => {});
      }
    })();
    return () => {
      live = false;
    };
  }, [idx, sorted, replaying]);

  if (!sorted.length) return null;
  // the compared pair, drawn as a highlighted stretch of the axis
  const marked = sorted.filter((a) => marks[a.conceptId]);
  const pair = marked.length === 2 ? [pos(marked[0]), pos(marked[1])] : null;
  return (
    <div className="c-timeline">
      <button
        type="button"
        className="c-btn c-play"
        onClick={() => {
          if (!playing && idx >= sorted.length - 1) onPick(sorted[0]);
          setPlaying(!playing);
        }}
        aria-pressed={playing}
        disabled={sorted.length < 2}
      >
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {playing ? t.timeline.pause : t.timeline.replay}
      </button>
      <div className="c-track" role="group" aria-label={t.timeline.group(fmtNum(sorted.length), fmtDate(sorted[0].start), fmtDate(sorted.at(-1)!.start))}>
        <span className="c-track-line" aria-hidden="true" />
        {pair && <span className="c-track-span" style={{ left: `${pair[0]}%`, width: `${pair[1] - pair[0]}%` }} aria-hidden="true" />}
        {sorted.map((a) => (
          <button
            key={a.conceptId}
            type="button"
            className="c-tick"
            style={{ left: `${pos(a)}%` }}
            aria-pressed={a.conceptId === current}
            aria-label={`${fmtDate(a.start)}${marks[a.conceptId] ? `, ${marks[a.conceptId]}` : ""}`}
            onClick={() => {
              setPlaying(false);
              onPick(a);
            }}
          >
            <span className="c-tick-dot" />
            {marks[a.conceptId] && <span className="c-tick-mark">{marks[a.conceptId]}</span>}
            <span className="c-tick-date">{fmtDayMonth(a.start)}</span>
          </button>
        ))}
      </div>
      <output className="c-timeline-now" aria-live="polite">
        {fmtDate(sorted[idx].start)}
        <small>{t.timeline.position(fmtNum(idx + 1), fmtNum(sorted.length))}</small>
      </output>
      {summary && <Summary sorted={sorted} points={summary} current={current} pos={pos} />}
    </div>
  );
}

type Point = Timeseries["points"][number];
const db = (v: number) => fmtNum(v, 1);

/**
 * Per-date backscatter summary on the timeline's own axis: mean γ⁰ (dot) with its 10th–90th percentile range (whisker).
 * Only processed dates have a value; every other date shows a dash, and nothing is drawn between dates.
 * Values are matched by granule, so a value is never shown against a different product of the same day.
 */
function Summary({ sorted, points, current, pos }: { sorted: Acquisition[]; points: Point[]; current: string | null; pos: (a: Acquisition) => number }) {
  const tl = useT().timeline;
  const by = new Map(points.map((p) => [p.granule, p]));
  const shown = sorted.filter((a) => by.has(a.granule));
  if (!shown.length) return null;
  const vals = shown.flatMap((a) => [by.get(a.granule)!.p10_db, by.get(a.granule)!.p90_db]);
  const [lo, hi] = [Math.floor(Math.min(...vals)), Math.ceil(Math.max(...vals))];
  const y = (v: number) => (hi > lo ? ((hi - v) / (hi - lo)) * 100 : 50); // % from the top
  const tip = (a: Acquisition, p: Point) =>
    tl.tip(fmtDate(a.start), db(p.mean_db), db(p.p10_db), db(p.p90_db), fmtNum(p.valid_km2, 1));

  return (
    <>
      <p className="c-sum-axis" aria-hidden="true">
        γ⁰ dB
        <span>{db(hi)}</span>
        <span>{db(lo)}</span>
      </p>
      <div className="c-sum" aria-hidden="true">
        {sorted.map((a) => {
          const p = by.get(a.granule);
          return p ? (
            <span key={a.conceptId} className={`c-sum-pt${a.conceptId === current ? " is-on" : ""}`} style={{ left: `${pos(a)}%` }} title={tip(a, p)}>
              <i className="c-sum-whisker" style={{ top: `${y(p.p90_db)}%`, height: `${y(p.p10_db) - y(p.p90_db)}%` }} />
              <i className="c-sum-dot" style={{ top: `${y(p.mean_db)}%` }} />
            </span>
          ) : (
            <span key={a.conceptId} className="c-sum-gap" style={{ left: `${pos(a)}%` }} title={tl.gapTip(fmtDate(a.start))}>
              –
            </span>
          );
        })}
      </div>
      {/* the wrapper stays 1px wide: a table grows to its content and would widen the page at 390 px */}
      <div className="c-sr">
        <table>
        <caption>{tl.caption}</caption>
        <thead>
          <tr>
            <th>{tl.date}</th>
            <th>{tl.mean}</th>
            <th>{tl.p10}</th>
            <th>{tl.p90}</th>
            <th>{tl.validArea}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const p = by.get(a.granule);
            return (
              <tr key={a.conceptId}>
                <td>{fmtDate(a.start)}</td>
                {p ? (
                  <>
                    <td>{db(p.mean_db)}</td>
                    <td>{db(p.p10_db)}</td>
                    <td>{db(p.p90_db)}</td>
                    <td>{fmtNum(p.valid_km2, 1)}</td>
                  </>
                ) : (
                  <td colSpan={4}>{tl.notProcessed}</td>
                )}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}
