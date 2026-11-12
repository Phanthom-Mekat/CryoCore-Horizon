"use client";

import { CloudRain } from "lucide-react";
import { rainBefore } from "@/lib/chattogram/rain";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { useCase } from "./CaseProvider";
import { RainChart, type RainMark } from "./RainChart";

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Rainfall context next to the radar (plan F13). `stack`: the whole season with every pass of the stack marked (Explore).
 * `pair`: the weeks around the two compared dates, with the rain in the 7 days up to each (Compare).
 */
export function RainCard({ mode }: { mode: "stack" | "pair" }) {
  const { rain, stack, before, after } = useCase();
  const t = useT();
  const r = t.rain;
  if (!rain || !stack || !before || !after) return null;

  const first = rain.days[0].date;
  const last = rain.days.at(-1)!.date;
  const clamp = (d: string) => (d < first ? first : d > last ? last : d);
  const dates = stack.items.map((a) => a.day).sort();
  const from = clamp(mode === "stack" ? iso(Date.parse(dates[0]) - 14 * DAY) : iso(Date.parse(before.day < after.day ? before.day : after.day) - 21 * DAY));
  const to = clamp(mode === "stack" ? dates.at(-1)! : iso(Date.parse(before.day < after.day ? after.day : before.day) + 3 * DAY));
  const marks: RainMark[] =
    mode === "stack"
      ? dates.map((d) => ({
          day: d,
          label: d === before.day ? t.before : d === after.day ? t.after : undefined,
          strong: d === before.day || d === after.day,
        }))
      : [
          { day: before.day, label: t.before, strong: true },
          { day: after.day, label: t.after, strong: true },
        ];
  const week = [
    { role: t.before, day: before.day, ...rainBefore(rain, before.day, 7) },
    { role: t.after, day: after.day, ...rainBefore(rain, after.day, 7) },
  ];

  return (
    <section className="c-rain-card" aria-labelledby={`rain-h-${mode}`}>
      <div className="c-rain-head">
        <div>
          <h2 id={`rain-h-${mode}`}>
            <CloudRain size={18} aria-hidden="true" />
            {r.title}
          </h2>
          <p>{mode === "stack" ? r.sub(fmtDate(from), fmtDate(to)) : r.subPair}</p>
        </div>
        {mode === "pair" && (
          <dl className="c-rain-totals" aria-label={r.totals}>
            {week.map((w) => (
              <div key={w.role}>
                <dt>
                  {w.role} · {fmtDate(w.day)}
                </dt>
                <dd>{w.days ? r.week(fmtNum(w.mm, 0)) : "–"}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <RainChart series={rain} from={from} to={to} marks={marks} label={r.label(fmtDate(from), fmtDate(to))} />
      <p className="c-rain-note">{r.caveat}</p>
      <p className="c-rain-source" lang="en" translate="no">
        {r.sourceLead} {rain.provider} {rain.apiVersion}, {rain.parameter} ({rain.longname}, {rain.units}) from {rain.sources.join(" + ")}; {rain.resolution};
        days in {rain.timeStandard}; retrieved {fmtDate(rain.retrievedAt)}.
      </p>
    </section>
  );
}
