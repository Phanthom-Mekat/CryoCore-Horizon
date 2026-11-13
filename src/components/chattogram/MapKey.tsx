"use client";

import { CHANGE, WATER, changeColor, type WaterCategory } from "@/lib/chattogram/palette";
import { fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "./BackendText";

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

/** Calibrated backscatter on one gray scale (the same for both dates), no-data transparent. `layer` is the backend's layer name. */
export function DbKey({ min, max, layer }: { min: number; max: number; layer?: string }) {
  const t = useT();
  const k = t.keys;
  const translated = layer ? t.processed.texts[layer] : undefined;
  return (
    <figure className="c-change-key" aria-label={k.dbAria(layer ? (translated ?? layer) : k.dbTitle, fmtNum(min), fmtNum(max))}>
      <p className="c-change-title">{layer ? <BackendText text={layer} translated={translated} /> : k.dbTitle}</p>
      <div className="c-change-ramp" style={{ background: "linear-gradient(90deg, #000, #fff)" }} />
      <div className="c-change-ticks" aria-hidden="true">
        <span>{fmtNum(min)}</span>
        <span>{fmtNum((min + max) / 2)}</span>
        <span>{fmtNum(max)}</span>
      </div>
      <figcaption>
        <span>{k.dbDarker}</span>
        <span>{k.dbNoData}</span>
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

export function FindingKey() {
  const t = useT();
  return <StripeKey label={t.keys.findings} items={FINDING} labels={{ increase: t.keys.increase, decrease: t.keys.decrease }} />;
}
