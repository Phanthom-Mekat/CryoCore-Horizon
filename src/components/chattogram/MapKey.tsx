"use client";

import { CHANGE, WATER, changeColor, type WaterCategory } from "@/lib/chattogram/palette";
import { fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

type Swatch = { label: string; color: string; stripe: number; icon: string };

/** Legend for water-change candidates: colour, stripe direction and an icon, so no category depends on colour alone. */
export function WaterKey() {
  const t = useT();
  const labels: Record<WaterCategory, string> = { new_water_candidate: t.keys.newWater, recession_candidate: t.keys.receding };
  return <StripeKey label={t.keys.water} items={WATER} labels={labels} />;
}

function StripeKey({ label, items, labels }: { label: string; items: Record<string, Swatch>; labels?: Record<string, string> }) {
  return (
    <ul className="c-key-list" aria-label={label}>
      {Object.entries(items).map(([id, w]) => (
        <li key={id}>
          <i
            className="c-key c-key-stripe"
            aria-hidden="true"
            style={{ background: `repeating-linear-gradient(${w.stripe}deg, ${w.color} 0 3px, color-mix(in srgb, ${w.color} 30%, transparent) 3px 8px)` }}
          />
          <span aria-hidden="true" className="c-key-icon" style={{ color: w.color }}>
            {w.icon}
          </span>
          {labels?.[id] ?? w.label}
        </li>
      ))}
    </ul>
  );
}

/** Separate diverging legend for signed backscatter change, so it never reads as a water classification. */
export function ChangeKey({ limit = CHANGE.limitDb }: { limit?: number }) {
  const t = useT();
  const ticks = [-limit, -limit / 2, 0, limit / 2, limit];
  const stops = Array.from({ length: 13 }, (_, i) => changeColor(-CHANGE.limitDb + (i * CHANGE.limitDb) / 6));
  return (
    <figure className="c-change-key" aria-label={t.keys.changeAria(fmtNum(limit))}>
      <p className="c-change-title">{t.keys.changeTitle}</p>
      <div className="c-change-ramp" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }} />
      <div className="c-change-ticks" aria-hidden="true">
        {ticks.map((v) => (
          <span key={v}>{v > 0 ? `+${fmtNum(v)}` : v < 0 ? `−${fmtNum(-v)}` : fmtNum(0)}</span>
        ))}
      </div>
      <figcaption>
        <span>{t.keys.darker}</span>
        <span>{t.keys.brighter}</span>
      </figcaption>
    </figure>
  );
}

/** Calibrated backscatter on one gray scale (the same for both dates), no-data transparent. */
export function DbKey({ min, max, title = "Backscatter γ⁰, dB" }: { min: number; max: number; title?: string }) {
  const f = (v: number) => (v < 0 ? `−${-v}` : String(v));
  return (
    <figure className="c-change-key" aria-label={`${title}, from ${f(min)} dB (black) to ${f(max)} dB (white); no data is transparent`}>
      <p className="c-change-title">{title}</p>
      <div className="c-change-ramp" style={{ background: "linear-gradient(90deg, #000, #fff)" }} />
      <div className="c-change-ticks" aria-hidden="true">
        <span>{f(min)}</span>
        <span>{f((min + max) / 2)}</span>
        <span>{f(max)}</span>
      </div>
      <figcaption>
        <span>← darker: smoother surface</span>
        <span>no data: clear</span>
      </figcaption>
    </figure>
  );
}

/**
 * Findings are areas of signed backscatter change, so they take the diverging scale's poles (never the water colours),
 * each with its own stripe direction and icon so the two kinds never depend on colour alone.
 */
export const FINDING = {
  increase: { label: "Observed increase (brighter)", color: CHANGE.pos, stripe: 45, icon: "▲" },
  decrease: { label: "Observed decrease (darker)", color: CHANGE.neg, stripe: 135, icon: "▼" },
} as const;

export const FindingKey = () => <StripeKey label="Observed radar change areas" items={FINDING} />;
