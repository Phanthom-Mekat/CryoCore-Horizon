"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Columns2, FileSearch, Layers, Map as MapIcon, Radar, ShieldCheck, Satellite } from "lucide-react";
import { Kpi, KpiStrip } from "@/components/dashboard/ui";
import { compatibility, covers, fmtDate } from "@/lib/chattogram/acquisitions";
import { CaseMap, quicklookSrc } from "../CaseMap";
import { FOCUS, useCase } from "../CaseProvider";

const OVERVIEW_VIEW = { lon: 91.95, lat: 22.75, zoom: 6.7 };

/** The front door: the question, the numbers, the way through the case, and the comparison to start with. */
export function OverviewView() {
  const { load, explorer, stack, before, after, href, source } = useCase();
  if (load.status !== "ready" || !stack || !before || !after) return null;

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
      <section className="c-hero">
        <div className="c-hero-copy">
          <p className="c-eyebrow">Case study · NASA–ISRO NISAR · Bangladesh</p>
          <h1>Where did surface water change around Chattogram?</h1>
          <p className="c-hero-lede">
            Monsoon cloud hides this coast for months at a time. NISAR’s L-band radar brings its own signal, so it sees the ground through cloud, day or night.
            Follow one radar track through the 2026 season, compare two passes, and check the evidence behind every picture.
          </p>
          <div className="c-hero-actions">
            <Link className="c-btn is-primary" href={href("/chattogram/compare")}>
              <Columns2 size={16} aria-hidden="true" />
              Start with a comparison
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="c-btn" href={href("/chattogram/explore")}>
              <MapIcon size={16} aria-hidden="true" />
              Explore the radar map
            </Link>
          </div>
        </div>
        <div className="c-hero-map">
          <CaseMap
            label={`Chattogram Division with the NISAR quicklook of ${fmtDate(after.start)}`}
            view={OVERVIEW_VIEW}
            image={after}
            imageOpacity={0.85}
            footprints={[after]}
            selected={after.conceptId}
            boundary={load.data.region.boundary}
            controls={false}
          />
          <p className="c-hero-map-cap">
            NISAR quicklook, {fmtDate(after.start)} · outline: Chattogram Division ({load.data.region.provenance.year} reference)
          </p>
        </div>
      </section>

      <KpiStrip label="The case in numbers">
        <Kpi label="NISAR scenes over the division" value={String(all.length)} sub={`${explorer?.summary.outside_division ?? 0} more stored scenes fall outside it`} icon={Layers} />
        <Kpi label="Observation days" value={String(explorer?.summary.observation_days ?? "–")} sub={`${fmtDate(starts[0])} to ${fmtDate(starts.at(-1)!)}`} icon={CalendarDays} />
        <Kpi label="Radar stacks over the city" value={String(overCity.length)} sub="Repeat passes from one orbit track" icon={Satellite} />
        <Kpi label="Provisional products" value={`${provisional} of ${all.length}`} sub="Early releases; checked before any comparison" icon={ShieldCheck} />
      </KpiStrip>

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
                {a.frozen || source.mode === "live" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- quicklook from the frozen case or our proxy, sized by CSS
                  <img src={quicklookSrc(a)} alt={`NISAR quicklook of ${fmtDate(a.start)}`} loading="lazy" />
                ) : (
                  <div className="c-thumb-missing">Not in the frozen case</div>
                )}
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
          <strong>Real now:</strong> NASA’s NISAR catalogue, scene footprints, radar quicklooks and the division boundary. <strong>Next:</strong> calibrated
          backscatter change and water-change candidates from the processing worker. Until then, differences are observed radar change, not a confirmed flood.{" "}
          <Link href={href("/chattogram/about")}>What this case can and can’t say</Link>
        </p>
      </section>
    </div>
  );
}
