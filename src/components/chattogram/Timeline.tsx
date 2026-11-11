"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { fmtDate, type Acquisition } from "@/lib/chattogram/acquisitions";
import { browseUrl } from "./CaseMap";

const FRAME_MS = 1400;

/**
 * Actual acquisition dates on a true time axis, so gaps stay visible. Play steps through them in order;
 * nothing is interpolated between dates.
 */
export function Timeline({ items, current, onPick, marks = {} }: { items: Acquisition[]; current: string | null; onPick: (a: Acquisition) => void; marks?: Record<string, string> }) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.start.localeCompare(b.start)), [items]);
  const [playing, setPlaying] = useState(false);
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
        await Promise.all([fetch(browseUrl(a, "bounds")), fetch(browseUrl(a))]).catch(() => {});
      }
    })();
    return () => {
      live = false;
    };
  }, [idx, sorted]);

  if (!sorted.length) return null;
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
        {playing ? "Pause" : "Replay"}
      </button>
      <div className="c-track" role="group" aria-label={`${sorted.length} NISAR acquisitions from ${fmtDate(sorted[0].start)} to ${fmtDate(sorted.at(-1)!.start)}`}>
        <span className="c-track-line" aria-hidden="true" />
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
            <span className="c-tick-date">{fmtDate(a.start).replace(/ \d{4}$/, "")}</span>
          </button>
        ))}
      </div>
      <output className="c-timeline-now" aria-live="polite">
        {fmtDate(sorted[idx].start)}
        <small>
          {idx + 1} of {sorted.length}
        </small>
      </output>
    </div>
  );
}
