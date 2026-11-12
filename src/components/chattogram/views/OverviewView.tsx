"use client";

import Link from "next/link";
import { ArrowRight, Columns2, FileSearch, Map as MapIcon, Radar, Scan, TrendingDown, TrendingUp } from "lucide-react";
import { compatibility, covers, fmtDate } from "@/lib/chattogram/acquisitions";
import { CaseMap, browseUrl } from "../CaseMap";
import { FOCUS, useCase } from "../CaseProvider";
import { PrepStatus } from "../PrepStatus";

// The hero map: on wide screens the coast sits to the right of the headline; on narrow ones it is centred under it.
const HERO_VIEW = { lon: 91.75, lat: 22.55, zoom: 6.6 };
const HERO_VIEW_WIDE = { lon: 90.05, lat: 22.6, zoom: 7.1 };

/** The front door: the question, the numbers, the way through the case, and the comparison to start with. */
export function OverviewView() {
  const { load, explorer, stack, before, after, href, processed, caseHref } = useCase();
  if (load.status !== "ready" || !stack || !before || !after) return null;
  // only rendered in the browser (the case loads client-side), so the viewport is known here
  const wide = window.matchMedia("(min-width: 1100px)").matches;
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

  const steps = [
    {
      n: "01",
      icon: MapIcon,
      title: "Explore the radar",
      body: "See each NISAR pass over the coast. Dark is smooth surface such as open water; bright is rough ground, buildings or vegetation.",
      link: "/chattogram/explore",
      cta: "Open the map",
    },
    {
      n: "02",
      icon: Columns2,
      title: "Compare two dates",
      body: "Drag a divider between two passes from the same orbit. The app checks that the two dates are fair to compare before you trust what you see.",
      link: "/chattogram/compare",
      cta: "Compare dates",
    },
    {
      n: "03",
      icon: FileSearch,
      title: "Check the evidence",
      body: "Every image traces back to its NASA product, version and checksum. Download the brief as JSON, CSV or GeoJSON, or print it.",
      link: "/chattogram/evidence",
      cta: "Read the brief",
    },
  ];

  return (
    <div className="c-overview">
      <section className="c-hero" aria-labelledby="hero-h">
        <div className="c-hero-map">
          <CaseMap
            label={`Chattogram Division with the NISAR quicklook of ${fmtDate(after.start)}`}
            view={wide ? HERO_VIEW_WIDE : HERO_VIEW}
            image={after}
            imageOpacity={0.9}
            footprints={[after]}
            selected={after.conceptId}
            boundary={load.data.region.boundary}
            controls={false}
          />
        </div>
        <span className="c-hero-sweep" aria-hidden="true" />
        <div className="c-hero-copy">
          <p className="c-eyebrow">Case study · NASA–ISRO NISAR · Bangladesh</p>
          <h1 id="hero-h">Where did surface water change around Chattogram?</h1>
          <p className="c-hero-lede">
            Monsoon cloud hides this coast for months at a time. NISAR’s L-band radar brings its own signal, so it sees the ground through cloud, day or night.
            Follow one radar track through the 2026 season, compare two passes, and check the evidence behind every picture.
          </p>
          <div className="c-hero-actions">
            <Link className="c-btn is-primary is-lg" href={href("/chattogram/compare")}>
              <Columns2 size={17} aria-hidden="true" />
              Start with a comparison
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="c-btn is-glass is-lg" href={href("/chattogram/explore")}>
              <MapIcon size={17} aria-hidden="true" />
              Explore the radar map
            </Link>
          </div>
        </div>
        <p className="c-hero-map-cap">
          NISAR quicklook (browse image), {fmtDate(after.start)} · outline: Chattogram Division ({load.data.region.provenance.year} reference)
        </p>
        <dl className="c-hero-stats" aria-label="The case in numbers">
          <div>
            <dt>NISAR scenes over the division</dt>
            <dd>{all.length}</dd>
            <dd className="c-stat-sub">{explorer?.summary.outside_division ?? 0} more stored scenes fall outside it</dd>
          </div>
          <div>
            <dt>Observation days</dt>
            <dd>{explorer?.summary.observation_days ?? "–"}</dd>
            <dd className="c-stat-sub">
              {fmtDate(starts[0])} to {fmtDate(starts.at(-1)!)}
            </dd>
          </div>
          <div>
            <dt>Radar stacks over the city</dt>
            <dd>{overCity.length}</dd>
            <dd className="c-stat-sub">Repeat passes from one orbit track</dd>
          </div>
          <div>
            <dt>Provisional products</dt>
            <dd>
              {provisional}
              <small> of {all.length}</small>
            </dd>
            <dd className="c-stat-sub">Early releases; checked before any comparison</dd>
          </div>
        </dl>
      </section>

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

      <section className="c-steps" aria-label="How to read this case">
        {steps.map(({ n, icon: Icon, title, body, link, cta }) => (
          <Link key={n} href={href(link)} className="c-step">
            <span className="c-step-n">{n}</span>
            <Icon size={20} aria-hidden="true" className="c-step-icon" />
            <h2>{title}</h2>
            <p>{body}</p>
            <span className="c-step-cta">
              {cta} <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </section>

      <section className="c-feature" aria-labelledby="feature-h">
        <div className="c-feature-copy">
          <p className="c-eyebrow">Featured comparison</p>
          <h2 id="feature-h">
            {fmtDate(before.start)} vs {fmtDate(after.start)}
          </h2>
          <p>
            Two passes {days} days apart from the same orbit: track {g.track}, frame {g.frame}, {g.direction.toLowerCase()}, over {FOCUS.name}.{" "}
            {differs.length
              ? `Compare with care: they differ in ${differs.map((c) => c.label.replace(/^Same /, "").toLowerCase()).join(", ")}.`
              : "Same polarizations, data maturity and product version, so a difference between them comes from the ground, not the processing."}
          </p>
          <Link className="c-btn is-primary" href={href("/chattogram/compare")}>
            Open this comparison
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="c-feature-pair">
          {[
            ["Before", before],
            ["After", after],
          ].map(([role, a]) =>
            typeof a === "string" ? null : (
              <figure key={role as string}>
                {/* eslint-disable-next-line @next/next/no-img-element -- quicklook served by our proxy, sized by CSS */}
                <img src={browseUrl(a)} alt={`NISAR quicklook of ${fmtDate(a.start)}`} loading="lazy" />
                <figcaption>
                  <strong>{role as string}</strong> {fmtDate(a.start)}
                </figcaption>
              </figure>
            ),
          )}
        </div>
      </section>

      <section className="c-honest" aria-label="What is real and what comes next">
        <Radar size={18} aria-hidden="true" />
        <p>
          {m ? (
            <>
              <strong>Real now:</strong> NASA’s NISAR catalogue, scene footprints, radar quicklooks, the division boundary and calibrated backscatter change for
              one pair over the analysis rectangle. <strong>Not claimed:</strong> water change, floods or damage; those need reference checks.{" "}
            </>
          ) : (
            <>
              <strong>Real now:</strong> NASA’s NISAR catalogue, scene footprints, radar quicklooks and the division boundary. <strong>Next:</strong> calibrated
              backscatter change and water-change candidates from the processing worker. Until then, differences are observed radar change, not a confirmed flood.{" "}
            </>
          )}
          <Link href={href("/chattogram/about")}>What this case can and can’t say</Link>
        </p>
      </section>
    </div>
  );
}
