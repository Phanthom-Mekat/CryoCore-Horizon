"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { covers } from "@/lib/chattogram/acquisitions";
import type { Finding } from "@/lib/chattogram/case-api";
import { fmtArea, fmtDate, fmtDayMonth, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { currentLang } from "@/lib/i18n/locale";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "../BackendText";
import { FOCUS, useCase, usePilot } from "../CaseProvider";
import { PrepStatus } from "../PrepStatus";
import { WardTeaser } from "../WardTeaser";

type Tone = "blue" | "orange" | "muted";
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(currentLang() === "bn" ? "bn-BD" : "en-GB", { month: "short", timeZone: "UTC" });

/** How a figure changes across the tested thresholds (2 → 6 dB), as a small line. */
function Spark({ values, tone, label }: { values: number[]; tone: Tone; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 112 + 4},${34 - (v / max) * 28}`).join(" ");
  return (
    <svg className={`db-spark is-${tone}`} viewBox="0 0 120 40" role="img" aria-label={label}>
      <polyline points={pts} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Kpi({ label, value, unit, sub, badge, tone, spark }: { label: string; value: string; unit?: string; sub: string; badge?: string; tone?: Tone; spark?: ReactNode }) {
  return (
    <div className="db-card db-kpi">
      <div className="db-kpi-top">
        <p>{label}</p>
        {spark}
      </div>
      <p className="db-kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </p>
      <div className="db-kpi-foot">
        <span>{sub}</span>
        {badge && <b className={tone ? `is-${tone}` : undefined}>{badge}</b>}
      </div>
    </div>
  );
}

/** Monthly rainfall; the wettest month is highlighted and labelled, and hovering or focusing a bar reads it out. */
function RainBars({ months, tip, label }: { months: { ym: string; mm: number; passes: number }[]; tip: (m: string, mm: string, n: string) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => m.mm), 1);
  const peak = months.findIndex((m) => m.mm === max);
  const shown = hover ?? peak;
  const w = 600 / months.length;
  const top = (mm: number) => 196 - Math.max(6, (mm / max) * 160);
  return (
    <svg className="db-bars" viewBox="0 0 600 236" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1="0" x2="600" y1={196 - g * 160} y2={196 - g * 160} className="db-grid" />
      ))}
      {months.map((m, i) => (
        <g key={m.ym} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={tip(monthName(m.ym), fmtNum(Math.round(m.mm)), fmtNum(m.passes))}>
          <rect x={i * w} y="0" width={w} height="236" fill="transparent" />
          <rect x={i * w + w * 0.24} y={top(m.mm)} width={w * 0.52} height={196 - top(m.mm)} rx="8" className={i === shown ? "db-bar is-on" : "db-bar"} />
          <text x={i * w + w / 2} y="222" textAnchor="middle" className={i === shown ? "db-axis is-on" : "db-axis"}>
            {monthName(m.ym)}
          </text>
        </g>
      ))}
      {months[shown] && (
        <g className="db-tip" transform={`translate(${Math.min(462, Math.max(0, shown * w + w / 2 - 69))}, ${Math.max(0, top(months[shown].mm) - 60)})`} aria-hidden="true">
          <rect width="138" height="50" rx="12" />
          <text x="69" y="20" textAnchor="middle" className="db-tip-k">
            {monthName(months[shown].ym)}
          </text>
          <text x="69" y="40" textAnchor="middle" className="db-tip-v">
            {fmtNum(Math.round(months[shown].mm))} mm
          </text>
        </g>
      )}
    </svg>
  );
}

/** The listed change areas by evidence quality: a ring with the total in the middle and a legend with counts. */
function Donut({ parts, total, totalLabel, label }: { parts: { key: string; n: number; label: string; tone: Tone }[]; total: number; totalLabel: string; label: string }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  let at = 0;
  return (
    <div className="db-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={label}>
        <circle cx="100" cy="100" r={r} className="db-donut-track" />
        {parts.map((p) => {
          const len = total ? (p.n / total) * c : 0;
          const seg = p.n ? (
            <circle key={p.key} cx="100" cy="100" r={r} className={`db-donut-seg is-${p.tone}`} strokeDasharray={`${Math.max(1, len - 5)} ${c}`} strokeDashoffset={-at} transform="rotate(-90 100 100)" />
          ) : null;
          at += len;
          return seg;
        })}
        <text x="100" y="92" textAnchor="middle" className="db-donut-k">
          {totalLabel}
        </text>
        <text x="100" y="124" textAnchor="middle" className="db-donut-v">
          {fmtNum(total)}
        </text>
      </svg>
      <ul className="db-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={`is-${p.tone}`} aria-hidden="true" />
            <b>{fmtNum(p.n)}</b> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Data first: four figures, the season's rain, the evidence mix, the radar passes and the largest change areas. */
export function OverviewView() {
  const { load, stack, before, after, href, processed, caseHref, rain } = useCase();
  const t = useT();
  const o = t.overview;
  const d = o.dash;
  const pilotLoad = usePilot();
  if (load.status !== "ready" || !stack || !before || !after) return null;

  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const m = pc?.detail.metrics ?? null;
  const rows = pc?.sensitivity?.rows ?? [];
  const findings: Finding[] = pc?.findings.features ?? [];
  const pilot = pilotLoad.status === "ready" ? pilotLoad.data : null;
  const openCase = caseHref("/chattogram/explore") ?? href("/chattogram/explore");
  const pct = (v: number) => (m && m.valid_common_km2 ? (v / m.valid_common_km2) * 100 : 0);
  const tiny = (v: number) => (v > 0 && v < 0.01 ? `< ${fmtNum(0.01, 2)}` : fmtArea(v));

  // the season's rain by month (a static NASA POWER file), with the radar passes over the city that month
  const passes = [...stack.items].sort((a, b) => a.start.localeCompare(b.start));
  const byMonth: Record<string, number> = {};
  for (const x of rain?.days ?? []) if (x.mm !== null) byMonth[x.date.slice(0, 7)] = (byMonth[x.date.slice(0, 7)] ?? 0) + x.mm;
  const months = Object.entries(byMonth).map(([ym, mm]) => ({ ym, mm, passes: passes.filter((a) => a.day.startsWith(ym)).length }));

  const quality = (["strong", "moderate", "weak"] as const).map((q, i) => ({
    key: q,
    n: findings.filter((f) => f.properties.quality === q).length,
    label: t.finding.quality[q],
    tone: (["blue", "orange", "muted"] as const)[i],
  }));
  const top = [...findings].sort((a, b) => b.properties.area_km2 - a.properties.area_km2).slice(0, 5);

  // every pass of the stack on one time axis, with the case's two dates marked
  const t0 = Date.parse(passes[0]?.start ?? before.start);
  const t1 = Date.parse(passes[passes.length - 1]?.start ?? after.start);
  const xOf = (iso: string) => 24 + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * 552;
  const pair = pc ? [pc.detail.before.date.slice(0, 10), pc.detail.after.date.slice(0, 10)] : [before.day, after.day];
  const overCity = load.data.stacks.filter((x) => covers(x.items[0], FOCUS.lonLat));

  return (
    <div className="db">
      <header className="db-head">
        <div>
          <h1>{pc ? <BackendText text={pc.detail.title} translated={o.caseTitles[pc.detail.id]} /> : d.title}</h1>
          <p>{pc ? d.span(fmtDate(pc.detail.before.date), fmtDate(pc.detail.after.date)) : d.pending}</p>
        </div>
        <div className="db-actions">
          <Link className="db-btn" href={href("/chattogram/compare")}>
            {o.startCompare}
          </Link>
          <Link className="db-btn is-primary" href={openCase}>
            {o.openCase}
          </Link>
        </div>
      </header>

      {pc && m ? (
        <section className="db-kpis" aria-label={d.kpis}>
          <Kpi
            label={d.brighter}
            value={fmtArea(m.increase_km2)}
            unit="km²"
            sub={d.atThreshold(fmtNum(m.threshold_db))}
            badge={d.ofArea(fmtNum(pct(m.increase_km2), 1))}
            tone="blue"
            spark={<Spark values={rows.map((r) => r.increase_km2)} tone="blue" label={d.sparkAria} />}
          />
          <Kpi
            label={d.darker}
            value={fmtArea(m.decrease_km2)}
            unit="km²"
            sub={d.atThreshold(fmtNum(m.threshold_db))}
            badge={d.ofArea(fmtNum(pct(m.decrease_km2), 1))}
            tone="orange"
            spark={<Spark values={rows.map((r) => r.decrease_km2)} tone="orange" label={d.sparkAria} />}
          />
          <Kpi label={d.compared} value={fmtArea(m.valid_common_km2)} unit="km²" sub={d.seenBoth} badge={d.missing(tiny(m.excluded_km2))} />
          <Kpi
            label={d.areas}
            value={fmtNum(findings.length)}
            sub={m.cross_pol ? d.agreeHv(fmtNum(m.cross_pol.findings_same_direction), fmtNum(m.cross_pol.findings_compared)) : d.atThreshold(fmtNum(m.threshold_db))}
            spark={<Spark values={rows.map((r) => r.listed_findings_present)} tone="blue" label={d.sparkAria} />}
          />
        </section>
      ) : (
        <section className="db-card">
          <PrepStatus />
        </section>
      )}

      <div className="db-row">
        <section className="db-card" aria-labelledby="rain-h">
          <div className="db-card-head">
            <div>
              <h2 id="rain-h">{d.rainTitle}</h2>
              <p>{d.rainSub}</p>
            </div>
            <span className="db-key">
              <i className="is-blue" aria-hidden="true" /> {d.rainKey}
            </span>
          </div>
          {months.length ? <RainBars months={months} tip={d.rainTip} label={d.rainAria} /> : <p className="db-muted">{d.rainNone}</p>}
          <p className="db-muted">{d.rainNote}</p>
        </section>

        {pc && (
          <section className="db-card" aria-labelledby="q-h">
            <div className="db-card-head">
              <h2 id="q-h">{d.qualityTitle}</h2>
            </div>
            <Donut parts={quality} total={findings.length} totalLabel={d.total} label={d.qualityAria} />
          </section>
        )}
      </div>

      <div className="db-row">
        <section className="db-card" aria-labelledby="passes-h">
          <div className="db-card-head">
            <div>
              <h2 id="passes-h">{d.passesTitle}</h2>
              <p>{d.passesSub(fmtNum(passes.length), fmtNum(overCity.length))}</p>
            </div>
          </div>
          <svg className="db-timeline" viewBox="0 0 600 112" role="img" aria-label={d.passesAria(fmtNum(passes.length))}>
            <line x1="24" x2="576" y1="66" y2="66" className="db-grid" />
            {passes.map((a) => {
              const on = pair.includes(a.day);
              return (
                <g key={a.conceptId}>
                  <title>{fmtDate(a.start)}</title>
                  <circle cx={xOf(a.start)} cy="66" r={on ? 8 : 5} className={on ? `db-pass is-${a.day === pair[0] ? "blue" : "orange"}` : "db-pass"} />
                  {on && (
                    <text x={Math.min(560, Math.max(40, xOf(a.start)))} y="40" textAnchor="middle" className="db-pass-label">
                      {a.day === pair[0] ? t.before : t.after} · {fmtDayMonth(a.start)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x="24" y="100" className="db-axis">
              {fmtDayMonth(passes[0]?.start ?? before.start)}
            </text>
            <text x="576" y="100" textAnchor="end" className="db-axis">
              {fmtDayMonth(passes[passes.length - 1]?.start ?? after.start)}
            </text>
          </svg>
        </section>

        {pc && (
          <section className="db-card" aria-labelledby="top-h">
            <div className="db-card-head">
              <h2 id="top-h">{d.topTitle}</h2>
              <Link href={href("/chattogram/evidence")} className="db-link">
                {d.all}
              </Link>
            </div>
            <ul className="db-list">
              {top.map((f) => {
                const p = f.properties;
                return (
                  <li key={p.id}>
                    <i className={p.kind === "increase" ? "is-blue" : "is-orange"} aria-hidden="true" />
                    <div>
                      <b>{t.finding.kind[p.kind]}</b>
                      <span>{t.finding.quality[p.quality]}</span>
                    </div>
                    <div className="db-list-v">
                      <b>{fmtArea(p.area_km2)} km²</b>
                      <span>{fmtSigned(p.mean_delta_db, 1)} dB</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <WardTeaser />

      <footer className="db-foot">
        <span>{d.caveat}</span>
        {pilot && <Link href={href("/chattogram/processed")}>{d.pilot(fmtNum(pilot.statistics.HHHH.common_area_km2, 1), fmtSigned(pilot.statistics.HHHH.median_change_db))}</Link>}
        <Link href={href("/chattogram/about")}>{o.canCant}</Link>
      </footer>
    </div>
  );
}
