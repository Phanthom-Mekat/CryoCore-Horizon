"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/** Before/after wipe. A native range input drives it, so keyboard and touch work for free. */
export function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  badge,
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  badge?: string;
}) {
  const [pos, setPos] = useState(50);
  const side = pos > 60 ? "before" : pos < 40 ? "after" : "split";
  return (
    <div className="compare" data-side={side} style={{ "--pos": `${pos}%` } as CSSProperties}>
      <div className="compare-layer" aria-hidden="true">{after}</div>
      <div className="compare-layer compare-before" aria-hidden="true">{before}</div>
      <div className="compare-handle" aria-hidden="true">
        <span className="compare-tick compare-tick-t" />
        <span className="compare-grip">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-4 5 4 5M15 7l4 5-4 5" />
          </svg>
        </span>
        <span className="compare-tick compare-tick-b" />
      </div>
      <span className="compare-tag compare-tag-l">{beforeLabel}</span>
      <span className="compare-tag compare-tag-r">{afterLabel}</span>
      {badge && <span className="compare-badge">{badge}</span>}
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        onDoubleClick={() => setPos(50)}
        aria-label={`Compare ${beforeLabel} with ${afterLabel}`}
        aria-valuetext={`${pos}% ${beforeLabel}, ${100 - pos}% ${afterLabel}`}
      />
    </div>
  );
}
