"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtDayMonth, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { browseUrl, quicklookSrc } from "./CaseMap";
import { useCase } from "./CaseProvider";

const FRAME_MS = 1400;

/**
 * Actual acquisition dates on a true time axis, so gaps stay visible. Play steps through them in order;
 * nothing is interpolated between dates.
 */
export function Timeline({ items, current, onPick, marks = {} }: { items: Acquisition[]; current: string | null; onPick: (a: Acquisition) => void; marks?: Record<string, string> }) {
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
    </div>
  );
}
