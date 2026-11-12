"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Columns2, FileSearch, Layers, Map as MapIcon, Radar, Scan, ShieldCheck, Satellite, TrendingDown, TrendingUp } from "lucide-react";
import { Kpi, KpiStrip } from "@/components/dashboard/ui";
import { compatibility, covers } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap, quicklookSrc } from "../CaseMap";
import { FOCUS, useCase } from "../CaseProvider";
import { PrepStatus } from "../PrepStatus";

const OVERVIEW_VIEW = { lon: 91.95, lat: 22.75, zoom: 6.7 };
const STEPS = [
  { n: 1, icon: MapIcon, link: "/chattogram/explore" },
  { n: 2, icon: Columns2, link: "/chattogram/compare" },
  { n: 3, icon: FileSearch, link: "/chattogram/evidence" },
];

/** The front door: the question, the numbers, the way through the case, and the comparison to start with. */
export function OverviewView() {
  const { load, explorer, stack, before, after, href, source, processed, caseHref } = useCase();
  const t = useT();
  const o = t.overview;
  if (load.status !== "ready" || !stack || !before || !after) return null;
  const detail = processed.status === "ready" ? processed.data.detail : null;
  const m = detail?.status === "ready" ? detail.metrics : null;
  const span = detail ? `${fmtDate(detail.before.date)} → ${fmtDate(detail.after.date)}` : "";
  const num = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));

  const all = load.data.acquisitions;
  const overCity = load.data.stacks.filter((s) => covers(s.items[0], FOCUS.lonLat));
  const provisional = all.filter((a) => a.maturity === "Provisional").length;
  const days = Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5);
  const g = stack.items[0];
  const starts = all.map((a) => a.start).sort();
  const differs = compatibility(before, after).filter((c) => !c.ok);
  const year = fmtNum(load.data.region.provenance.year);

  return (
    <div className="c-overview">
      <section className="c-hero">
        <div className="c-hero-copy">
          <p className="c-eyebrow">{o.eyebrow}</p>
          <h1>{o.title}</h1>
          <p className="c-hero-lede">{o.lede}</p>
          <div className="c-hero-actions">
            <Link className="c-btn is-primary" href={href("/chattogram/compare")}>
              <Columns2 size={16} aria-hidden="true" />
              {o.startCompare}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="c-btn" href={href("/chattogram/explore")}>
              <MapIcon size={16} aria-hidden="true" />
              {o.exploreMap}
            </Link>
          </div>
        </div>
        <div className="c-hero-map">
          <CaseMap
            label={o.mapLabel(fmtDate(after.start))}
            view={OVERVIEW_VIEW}
            image={after}
            imageOpacity={0.9}
            footprints={[after]}
            selected={after.conceptId}
            boundary={load.data.region.boundary}
            controls={false}
          />
          <p className="c-hero-map-cap">{o.mapCaption(fmtDate(after.start), year)}</p>
        </div>
      </section>

      <KpiStrip label={o.kpis}>
        <Kpi label={o.kpiScenes} value={fmtNum(all.length)} sub={o.kpiScenesSub(fmtNum(explorer?.summary.outside_division ?? 0))} icon={Layers} />
        <Kpi
          label={o.kpiDays}
          value={explorer ? fmtNum(explorer.summary.observation_days) : "–"}
          sub={o.kpiDaysSub(fmtDate(starts[0]), fmtDate(starts.at(-1)!))}
          icon={CalendarDays}
        />
        <Kpi label={o.kpiStacks} value={fmtNum(overCity.length)} sub={o.kpiStacksSub} icon={Satellite} />
        <Kpi label={o.kpiProvisional} value={o.kpiProvisionalValue(fmtNum(provisional), fmtNum(all.length))} sub={o.kpiProvisionalSub} icon={ShieldCheck} />
      </KpiStrip>

      <section className={`c-processed${m ? " is-ready" : ""}`} aria-labelledby="processed-h">
        <div className="c-processed-head">
          <p className="c-eyebrow">{m ? "Processed case · measured from the calibrated GCOV files" : "Processed case · not processed yet"}</p>
          <h2 id="processed-h">{detail ? detail.title : "Karnaphuli estuary"}</h2>
          {detail && (
            <p className="c-pair" aria-label={`Pair: ${span}`}>
              <span>
                <small>Before</small>
                {fmtDate(detail.before.date)}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
              <span>
                <small>After</small>
                {fmtDate(detail.after.date)}
              </span>
            </p>
          )}
          <Link className="c-btn is-primary" href={caseHref("/chattogram/explore") ?? href("/chattogram/explore")}>
            Open the case
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {detail && m ? (
          <div className="c-processed-body">
            <dl className="c-figures" aria-label={`Processed case in numbers, ${span}`}>
              <div>
                <dt>
                  <Scan size={16} aria-hidden="true" />
                  Valid in both dates
                </dt>
                <dd>
                  {num(m.valid_common_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">
                  of the {num(m.analysis_km2)} km² analysis rectangle · {span}
                </dd>
              </div>
              <div className="is-up">
                <dt>
                  <TrendingUp size={16} aria-hidden="true" />
                  Observed increase
                </dt>
                <dd>
                  {num(m.increase_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">
                  brighter by ≥ {m.threshold_db} dB · {span}
                </dd>
              </div>
              <div className="is-down">
                <dt>
                  <TrendingDown size={16} aria-hidden="true" />
                  Observed decrease
                </dt>
                <dd>
                  {num(m.decrease_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">
                  darker by ≥ {m.threshold_db} dB · {span}
                </dd>
              </div>
            </dl>
            <p className="c-hint">
              Observed radar change in calibrated backscatter (γ⁰), not confirmed water change, flooding or damage. Analysis area: {detail.analysis_area.properties?.provenance}.
            </p>
          </div>
        ) : (
          <div className="c-processed-body">
            <PrepStatus />
          </div>
        )}
      </section>

      <section className="c-steps" aria-label={o.stepsLabel}>
        {STEPS.map(({ n, icon: Icon, link }, i) => (
          <Link key={n} href={href(link)} className="c-step">
            <span className="c-step-n">{fmtNum(n).padStart(2, fmtNum(0))}</span>
            <Icon size={20} aria-hidden="true" className="c-step-icon" />
            <h2>{o.steps[i].title}</h2>
            <p>{o.steps[i].body}</p>
            <span className="c-step-cta">
              {o.steps[i].cta} <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </section>

      <section className="c-feature" aria-labelledby="feature-h">
        <div className="c-feature-copy">
          <p className="c-eyebrow">{o.featured}</p>
          <h2 id="feature-h">{t.vs(fmtDate(before.start), fmtDate(after.start))}</h2>
          <p>
            {o.featuredBody(
              fmtNum(days),
              g.track === null ? "–" : fmtNum(g.track),
              g.frame === null ? "–" : fmtNum(g.frame),
              t.direction[g.direction],
              t.place.focus,
            )}{" "}
            {differs.length ? o.featuredCare(differs.map((c) => t.checks[c.key].noun).join(", ")) : o.featuredSame}
          </p>
          <Link className="c-btn is-primary" href={href("/chattogram/compare")}>
            {o.openComparison}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="c-feature-pair">
          {[
            { role: t.before, a: before },
            { role: t.after, a: after },
          ].map(({ role, a }) => (
            <figure key={a.conceptId + role}>
              {a.frozen || source.mode === "live" ? (
                // eslint-disable-next-line @next/next/no-img-element -- quicklook from the frozen case or our proxy, sized by CSS
                <img src={quicklookSrc(a)} alt={t.quicklookOf(fmtDate(a.start))} loading="lazy" />
              ) : (
                <div className="c-thumb-missing">{o.notFrozen}</div>
              )}
              <figcaption>
                <strong>{role}</strong> {fmtDate(a.start)}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="c-honest" aria-label={o.honestLabel}>
        <Radar size={18} aria-hidden="true" />
        <p>
          {m ? (
            <span lang="en">
              <strong>Real now:</strong> NASA’s NISAR catalogue, scene footprints, radar quicklooks, the division boundary and calibrated backscatter change for
              one pair over the analysis rectangle. <strong>Not claimed:</strong> water change, floods or damage; those need reference checks.{" "}
            </span>
          ) : (
            <>
              <strong>{o.realNow}</strong> {o.realNowBody} <strong>{o.next}</strong> {o.nextBody}
            </>
          )}{" "}
          <Link href={href("/chattogram/about")}>{o.canCant}</Link>
        </p>
      </section>
    </div>
  );
}
