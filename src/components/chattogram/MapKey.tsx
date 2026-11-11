import { CHANGE, WATER, changeColor } from "@/lib/chattogram/palette";

/** Legend for water-change candidates: colour, stripe direction and an icon, so no category depends on colour alone. */
export function WaterKey() {
  return (
    <ul className="c-key-list" aria-label="Water change candidates">
      {Object.entries(WATER).map(([id, w]) => (
        <li key={id}>
          <i
            className="c-key c-key-stripe"
            aria-hidden="true"
            style={{ background: `repeating-linear-gradient(${w.stripe}deg, ${w.color} 0 3px, color-mix(in srgb, ${w.color} 30%, transparent) 3px 8px)` }}
          />
          <span aria-hidden="true" className="c-key-icon" style={{ color: w.color }}>
            {w.icon}
          </span>
          {w.label}
        </li>
      ))}
    </ul>
  );
}

/** Separate diverging legend for signed backscatter change, so it never reads as a water classification. */
export function ChangeKey() {
  const ticks = [-CHANGE.limitDb, -CHANGE.limitDb / 2, 0, CHANGE.limitDb / 2, CHANGE.limitDb];
  const stops = Array.from({ length: 13 }, (_, i) => changeColor(-CHANGE.limitDb + (i * CHANGE.limitDb) / 6));
  return (
    <figure className="c-change-key" aria-label={`Signed backscatter change, from −${CHANGE.limitDb} dB (darker) to +${CHANGE.limitDb} dB (brighter)`}>
      <p className="c-change-title">Signed backscatter change, dB</p>
      <div className="c-change-ramp" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }} />
      <div className="c-change-ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{t > 0 ? `+${t}` : t < 0 ? `−${-t}` : "0"}</span>
        ))}
      </div>
      <figcaption>
        <span>← darker: smoother or wetter</span>
        <span>brighter: rougher →</span>
      </figcaption>
    </figure>
  );
}
