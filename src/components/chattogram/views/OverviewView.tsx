"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Columns2, FileSearch, Layers, Map as MapIcon, Radar, Ruler, Scan, ScanLine, ShieldCheck, Satellite, Activity, TrendingDown, TrendingUp } from "lucide-react";
import { Kpi, KpiStrip } from "@/components/dashboard/ui";
import { compatibility, covers } from "@/lib/chattogram/acquisitions";
import { fmtArea, fmtDate, fmtDayMonth, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "../BackendText";
import { CaseMap, quicklookSrc } from "../CaseMap";
import { FOCUS, useCase, usePilot } from "../CaseProvider";
import { PrepStatus } from "../PrepStatus";
import { WardTeaser } from "../WardTeaser";

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
  const pilotLoad = usePilot();
  if (load.status !== "ready" || !stack || !before || !after) return null;
  const detail = processed.status === "ready" ? processed.data.detail : null;
  const m = detail?.status === "ready" ? detail.metrics : null;
  const span = detail ? `${fmtDate(detail.before.date)} → ${fmtDate(detail.after.date)}` : "";
  const provenance = detail?.analysis_area.properties?.provenance;

  const all = load.data.acquisitions;
  const overCity = load.data.stacks.filter((s) => covers(s.items[0], FOCUS.lonLat));
  const provisional = all.filter((a) => a.maturity === "Provisional").length;
  const days = Math.round((Date.parse(after.start) - Date.parse(before.start)) / 864e5);
  const g = stack.items[0];
  const starts = all.map((a) => a.start).sort();
  const differs = compatibility(before, after).filter((c) => !c.ok);
  const year = fmtNum(load.data.region.provenance.year);
  const pilot = pilotLoad.status === "ready" ? pilotLoad.data : null;
  const hh = pilot?.statistics.HHHH;

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
          <p className="c-eyebrow">{m ? o.caseMeasured : o.casePending}</p>
          <h2 id="processed-h">{detail ? <BackendText text={detail.title} translated={o.caseTitles[detail.id]} /> : o.caseFallbackTitle}</h2>
          {detail && (
            <p className="c-pair" aria-label={o.casePair(span)}>
              <span>
                <small>{t.before}</small>
                {fmtDate(detail.before.date)}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
              <span>
                <small>{t.after}</small>
                {fmtDate(detail.after.date)}
              </span>
            </p>
          )}
          <Link className="c-btn is-primary" href={caseHref("/chattogram/explore") ?? href("/chattogram/explore")}>
            {o.openCase}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {detail && m ? (
          <div className="c-processed-body">
            <dl className="c-figures" aria-label={o.caseFigures(span)}>
              <div>
                <dt>
                  <Scan size={16} aria-hidden="true" />
                  {o.validBoth}
                </dt>
                <dd className="c-stat-value">
                  {fmtArea(m.valid_common_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">{o.validBothSub(fmtArea(m.analysis_km2), span)}</dd>
              </div>
              <div className="is-up">
                <dt>
                  <TrendingUp size={16} aria-hidden="true" />
                  {o.increase}
                </dt>
                <dd className="c-stat-value">
                  {fmtArea(m.increase_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">{o.increaseSub(fmtNum(m.threshold_db), span)}</dd>
              </div>
              <div className="is-down">
                <dt>
                  <TrendingDown size={16} aria-hidden="true" />
                  {o.decrease}
                </dt>
                <dd className="c-stat-value">
                  {fmtArea(m.decrease_km2)}
                  <small>km²</small>
                </dd>
                <dd className="c-stat-sub">{o.decreaseSub(fmtNum(m.threshold_db), span)}</dd>
              </div>
            </dl>
            <p className="c-hint">
              {o.caseHint}
              {provenance && (
                <>
                  {" "}
                  {o.analysisArea} <BackendText text={provenance} translated={o.areaProvenance[provenance]} />
                  {t.stop}
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="c-processed-body">
            <PrepStatus />
          </div>
        )}
      </section>

      <WardTeaser />

      {pilot && hh && (
        <KpiStrip label={o.pilotKpis}>
          <Kpi label={o.kpiPilot} value={o.kpiPilotValue(fmtDayMonth(pilot.sources[0].acquisition), fmtDate(pilot.sources[1].acquisition))} sub={o.kpiPilotSub} icon={Radar} />
          <Kpi label={o.kpiArea} value={fmtNum(hh.common_area_km2, 2)} unit="km²" sub={o.kpiAreaSub(fmtNum(hh.outside_roi_area_km2, 2))} icon={ScanLine} />
          <Kpi label={o.kpiMedian} value={fmtSigned(hh.median_change_db)} unit="dB" sub={o.kpiMedianSub(fmtSigned(pilot.statistics.HVHV.median_change_db))} icon={Activity} />
          <Kpi label={o.kpiSpread} value={o.kpiSpreadValue(fmtSigned(hh.change_percentiles_db[0]), fmtSigned(hh.change_percentiles_db[2]))} unit="dB" sub={o.kpiSpreadSub} icon={Ruler} />
        </KpiStrip>
      )}

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
            <>
              <strong>{o.realNow}</strong> {o.realNowCaseBody} <strong>{o.notClaimed}</strong> {o.notClaimedBody}
            </>
          ) : (
            <>
              <strong>{o.realNow}</strong> {o.realNowBody} <strong>{o.next}</strong> {o.nextBody}
            </>
          )}{" "}
          <Link href={href("/chattogram/processed")}>{o.openPilot}</Link>
          {t.stop} <Link href={href("/chattogram/about")}>{o.canCant}</Link>
        </p>
      </section>
    </div>
  );
}
