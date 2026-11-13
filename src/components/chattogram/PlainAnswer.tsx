"use client";

import { CircleHelp, Droplets, Minus, Scissors, Ship, Sprout, SunMedium, Waves, X, type LucideIcon } from "lucide-react";
import type { CaseLayer, PlainId } from "@/lib/chattogram/case-api";
import type { PlainReading } from "@/lib/chattogram/plain";
import { fmtArea } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

/** An icon per category, so no answer depends on colour alone. */
const ICON: Record<PlainId | "none", LucideIcon> = {
  water: Waves,
  object: Ship,
  water_came: Droplets,
  water_went: SunMedium,
  plants_grew: Sprout,
  plants_lost: Scissors,
  surface: CircleHelp,
  none: Minus,
};

const solid = (layer: CaseLayer, id: PlainId) => layer.categories?.find((x) => x.id === id)?.color ?? "transparent";
// the legend chip is as faint as the map for water on both dates; badges stay solid so their dark icon reads
const swatch = (layer: CaseLayer, id: PlainId) => (id === "water" ? `color-mix(in srgb, ${solid(layer, id)} 40%, transparent)` : solid(layer, id));

/** Legend of the plain layer: every category the case has, with its icon and area. */
export function PlainKey({ layer, before, after, tapHint = true }: { layer: CaseLayer; before: string; after: string; tapHint?: boolean }) {
  const p = useT().plain;
  const cats = (layer.categories ?? []).filter((c) => c.area_km2 > 0);
  return (
    <figure className="c-plain-key">
      <p className="c-change-title">{p.keyTitle(before, after)}</p>
      <ul className="c-key-list">
        {cats.map((c) => {
          const Icon = ICON[c.id];
          return (
            <li key={c.id}>
              <i className="c-key" aria-hidden="true" style={{ background: swatch(layer, c.id) }} />
              <Icon size={15} aria-hidden="true" className="c-plain-icon" />
              <span>
                {p.cats[c.id].title}
                {c.id === "water" && <small> · {p.orientation}</small>}
              </span>
              <span className="c-plain-area">{fmtArea(c.area_km2)} km²</span>
            </li>
          );
        })}
      </ul>
      {tapHint && <figcaption className="c-hint">{p.tapHint}</figcaption>}
    </figure>
  );
}

/** The plain answer for one tapped spot: what the radar saw, what it likely means, what else it could be. */
export function PlainAnswer({
  reading,
  layer,
  between,
  onClose,
}: {
  reading: PlainReading | null;
  layer: CaseLayer;
  between: string;
  onClose?: () => void;
}) {
  const p = useT().plain;
  if (!reading) return <p className="c-hint" role="status">{p.loading}</p>;
  if (reading.kind === "outside") return <p className="c-hint" role="status">{p.outside}</p>;
  const id = reading.kind === "category" ? reading.id : "none";
  const c = p.cats[id];
  const Icon = ICON[id];
  return (
    <section className="c-plain-answer" aria-live="polite" aria-label={p.answerTitle}>
      <header>
        <p className="c-label">{p.answerTitle}</p>
        {onClose && (
          <button type="button" className="c-btn c-finding-close c-noprint" onClick={onClose} aria-label={p.close}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      <h2>
        <span className="c-plain-badge" style={id === "none" ? { color: "var(--c-text)" } : { background: solid(layer, id) }} aria-hidden="true">
          <Icon size={18} />
        </span>
        {c.title}
      </h2>
      <p className="c-hint">{between}</p>
      <dl>
        <dt>{p.saw}</dt>
        <dd>{c.saw}</dd>
        <dt>{p.means}</dt>
        <dd>{c.means}</dd>
        <dt>{p.also}</dt>
        <dd>{c.also}</dd>
      </dl>
      <p className="c-plain-sure">{p.sure}</p>
    </section>
  );
}

/** One line for a finding: its plain category and meaning. */
export function PlainLine({ id, layer }: { id: PlainId; layer: CaseLayer }) {
  const p = useT().plain;
  const Icon = ICON[id];
  return (
    <p className="c-plain-line">
      <span className="c-plain-badge" style={{ background: solid(layer, id) }} aria-hidden="true">
        <Icon size={15} />
      </span>
      <span>
        <strong>
          {p.inWords}: {p.cats[id].title}.
        </strong>{" "}
        {p.cats[id].means} <small>{p.sure}</small>
      </span>
    </p>
  );
}
