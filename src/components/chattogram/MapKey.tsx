"use client";

import { CHANGE, WATER, changeColor, type WaterCategory } from "@/lib/chattogram/palette";
import { fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

/** Legend for water-change candidates: colour, stripe direction and an icon, so no category depends on colour alone. */
export function WaterKey() {
  const t = useT();
  const label: Record<WaterCategory, string> = { new_water_candidate: t.keys.newWater, recession_candidate: t.keys.receding };
  return (
    <ul className="c-key-list" aria-label={t.keys.water}>
      {(Object.entries(WATER) as [WaterCategory, (typeof WATER)[WaterCategory]][]).map(([id, w]) => (
        <li key={id}>
          <i
            className="c-key c-key-stripe"
            aria-hidden="true"
            style={{ background: `repeating-linear-gradient(${w.stripe}deg, ${w.color} 0 3px, color-mix(in srgb, ${w.color} 30%, transparent) 3px 8px)` }}
          />
          <span aria-hidden="true" className="c-key-icon" style={{ color: w.color }}>
            {w.icon}
          </span>
          {label[id]}
        </li>
      ))}
    </ul>
  );
}

/** Separate diverging legend for signed backscatter change, so it never reads as a water classification. */
export function ChangeKey() {
  const t = useT();
  const ticks = [-CHANGE.limitDb, -CHANGE.limitDb / 2, 0, CHANGE.limitDb / 2, CHANGE.limitDb];
  const stops = Array.from({ length: 13 }, (_, i) => changeColor(-CHANGE.limitDb + (i * CHANGE.limitDb) / 6));
  return (
    <figure className="c-change-key" aria-label={t.keys.changeAria(fmtNum(CHANGE.limitDb))}>
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
