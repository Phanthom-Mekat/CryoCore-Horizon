import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Box, CloudOff, FileText, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { HeroGlobe } from "@/components/HeroGlobe";
import { RadarSteps } from "@/components/RadarSteps";
import { CloudCompare, type CloudPair } from "@/components/CloudCompare";
import { CASE, CATALOG, PASSES, STACKS, TRACKS, day, dayYear, gaps, localTime, maturityLabel, mode } from "@/lib/chattogram/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const LINKS = {
  repo: "https://github.com/Phanthom-Mekat/CryoCore-Horizon",
  challenge: "https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/",
};

// The processed Karnaphuli case, from the committed snapshot (pnpm freeze-case): every figure on this page is its result.
type Snapshot = {
  curated: {
    detail: { metrics: { analysis_km2: number }; before: { date: string }; after: { date: string } };
    findings: { features: unknown[] };
    layers: { id: string; categories?: { id: string; area_km2: number }[] }[];
  };
};
const SNAPSHOT = JSON.parse(readFileSync(join(process.cwd(), "public/data/chattogram/case/case.json"), "utf8")) as Snapshot;
const RESULT = SNAPSHOT.curated;
const AREAS = Object.fromEntries((RESULT.layers.find((l) => l.id === "plain")?.categories ?? []).map((c) => [c.id, c.area_km2]));
const km2 = (v: number | undefined) => (v === undefined ? "–" : v < 10 ? v.toFixed(2) : v.toFixed(1));
const DATES = `${dayYear(RESULT.detail.before.date)} and ${dayYear(RESULT.detail.after.date)}`;
const FEATURES = [
  {
    icon: CloudOff,
    title: "Sees through the monsoon",
    body: "NISAR’s radar images Chattogram every 12 days, day or night. Slide between a cloud-covered camera photo and radar from the same morning.",
    href: "/chattogram/tour?source=frozen",
    cta: "Take the tour",
  },
  {
    icon: MapPin,
    title: "A plain answer for every field",
    body: `Tap anywhere: what the radar saw, what it likely means and what to do next. Between ${DATES}, crops likely grew on ${km2(AREAS.plants_grew)} km² of farmland by the Karnaphuli.`,
    href: "/chattogram/explore?source=frozen",
    cta: "Open the map",
  },
  {
    icon: Box,
    title: "Change you can see in 3D",
    body: "Every change area rises from the map, coloured by what likely happened and as tall as the radar change. Fly around the river, port and fields.",
    href: "/chattogram/explore?source=frozen",
    cta: "Explore in 3D",
  },
  {
    icon: Sparkles,
    title: "Ask the map, in English or Bangla",
    body: "An assistant reads the case data, answers in plain words, moves the map to what you ask about and downloads the brief for you.",
    href: "/chattogram",
    cta: "Ask a question",
  },
  {
    icon: FileText,
    title: "Evidence you can hand over",
    body: "Each answer keeps its dates, measurements and NASA sources. Download a brief for an agriculture officer or a relief team.",
    href: "/chattogram/evidence?source=frozen",
    cta: "See the evidence",
  },
  {
    icon: ShieldCheck,
    title: "Honest about what radar can’t tell",
    body: "Every reading says “likely”, never “confirmed”. A tide, wet soil or a moored boat can look the same to radar, so a field visit still decides.",
    href: "/chattogram/about",
    cta: "How we check",
  },
];

// Everything below is computed from the frozen NISAR catalog snapshot (src/data/chattogram/catalog.json).
const first = CASE[0];
const last = CASE[CASE.length - 1];
const [[W, N], , [E, S]] = first.browse.quad;
const PAIRS: CloudPair[] = CASE.map((p) => ({
  key: p.id,
  day: day(p.start),
  radarTime: localTime(p.start),
  radar: p.browse.src,
  optical: p.optical.src,
}));
const CLOUDY = Math.max(0, CASE.findIndex((p) => p.start.startsWith("2026-07-12"))); // a fully overcast morning
const GAP_AFTER = new Map(gaps(CASE).map(([a]) => [a.id, day(new Date(Date.parse(a.start) + 12 * 864e5).toISOString())]));
const MATURITY = [...new Set(CASE.map((p) => maturityLabel[p.maturity]))].join(" and ");
const sortedStarts = PASSES.map((p) => p.start).sort();

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <SiteNav />

      <main id="main">
        <section className="hero" id="top">
          <HeroGlobe />
          <div className="hero-copy">
            <p className="kicker">Team CryoCore Horizon, NASA Space Apps Challenge 2026</p>
            <h1>After the flood, where do you check first?</h1>
            <p className="lede">
              When monsoon clouds hide Chattogram&rsquo;s streets and fields, NASA–ISRO radar can still see the ground. Compare two dates and
              find places along the Karnaphuli where the surface may have changed.
            </p>
            <div className="actions">
              <Link className="btn" href="/chattogram/tour?source=frozen">
                See what changed
              </Link>
              <Link className="link" href="/chattogram">Open the case study</Link>
            </div>
          </div>
          <a className="hero-scroll" href="#clouds">
            <span>Scroll to story ↓</span>
            <span className="hero-scroll-line" aria-hidden="true" />
          </a>
        </section>

        <section className="section" id="clouds" aria-labelledby="clouds-h">
          <div className="wrap">
            <div className="intro">
              <h2 id="clouds-h">Monsoon cloud hides the delta for months</h2>
              <div className="prose">
                <p>
                  From June into October the southwest monsoon covers coastal Bangladesh in cloud, in the same months the rivers rise and fields
                  flood. A camera in orbit sees the cloud tops.
                </p>
                <p>NISAR brings its own microwave signal, which passes through cloud. Here is the same morning, seen both ways.</p>
              </div>
            </div>
            <CloudCompare pairs={PAIRS} aspect={(E - W) / (N - S)} initial={CLOUDY} track={first.track} frame={first.frame} />
          </div>
        </section>

        <section className="section" id="radar" aria-labelledby="radar-h">
          <div className="wrap">
            <div className="intro">
              <h2 id="radar-h">How NISAR sees the ground through cloud</h2>
              <p className="prose">Four steps turn microwave echoes into a picture of land and water. Pick a step to see it.</p>
            </div>
            <RadarSteps />
          </div>
        </section>

        <section className="section section-deep" id="dashboard" aria-labelledby="dashboard-h">
          <div className="wrap">
            <div className="intro">
              <h2 id="dashboard-h">From radar echoes to a place to check</h2>
              <p className="prose">
                The dashboard turns two NISAR passes over the lower Karnaphuli into answers a farmer or an agriculture officer can act on.
              </p>
            </div>
            <dl className="result-strip" aria-label={`Karnaphuli case, ${DATES}`}>
              <div>
                <dt>Area compared</dt>
                <dd>{km2(RESULT.detail.metrics.analysis_km2)} km²</dd>
              </div>
              <div>
                <dt>Change areas found</dt>
                <dd>{RESULT.findings.features.length}</dd>
              </div>
              <div>
                <dt>Likely crop growth</dt>
                <dd>{km2(AREAS.plants_grew)} km²</dd>
              </div>
              <div>
                <dt>Likely new water</dt>
                <dd>{km2(AREAS.water_came)} km²</dd>
              </div>
            </dl>
            <ul className="features">
              {FEATURES.map(({ icon: Icon, title, body, href, cta }) => (
                <li key={title}>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <Link href={href}>{cta} →</Link>
                </li>
              ))}
            </ul>
            <div className="actions delta-cta">
              <Link className="btn" href="/chattogram/tour?source=frozen">
                See what changed
              </Link>
              <Link className="link" href="/chattogram">Open the dashboard</Link>
            </div>
          </div>
        </section>

        <section className="section section-deep" id="delta" aria-labelledby="delta-h">
          <div className="wrap">
            <div className="intro">
              <h2 id="delta-h">One monsoon, {CASE.length} radar passes</h2>
              <p className="prose">
                We follow one stack of images, track {first.track} frame {first.frame}. It covers Chattogram city, Feni, Sandwip and the
                Meghna estuary. NISAR passed over every 12 days from {dayYear(first.start)} to {dayYear(last.start)}, always in the same radar
                mode ({mode(first)}), so any two dates compare fairly.
              </p>
            </div>

            <ol className="reel" aria-label="NISAR radar images of the case stack, in date order">
              {CASE.map((p) => (
                <Fragment key={p.id}>
                  <li>
                    <Image src={p.browse.src} alt={`NISAR radar image, ${day(p.start)}`} width={240} height={Math.round((240 * (N - S)) / (E - W))} sizes="180px" />
                    <span>{day(p.start)}</span>
                  </li>
                  {GAP_AFTER.has(p.id) && (
                    <li className="reel-gap">
                      <span className="reel-gap-box">No image in the catalog</span>
                      <span>{GAP_AFTER.get(p.id)}</span>
                    </li>
                  )}
                </Fragment>
              ))}
            </ol>

            <div className="delta-specs">
                <dl className="specs">
                  <div>
                    <dt>NISAR scenes over the study area</dt>
                    <dd>{PASSES.length}</dd>
                  </div>
                  <div>
                    <dt>Orbit tracks</dt>
                    <dd>{TRACKS.length}</dd>
                  </div>
                  <div>
                    <dt>Track and frame stacks</dt>
                    <dd>{STACKS.length}</dd>
                  </div>
                  <div>
                    <dt>Scenes from</dt>
                    <dd>
                      {day(sortedStarts[0])} to {dayYear(sortedStarts[sortedStarts.length - 1])}
                    </dd>
                  </div>
                </dl>
                <p className="source">
                  Source: NASA Earthdata CMR, NISAR L2 GCOV, snapshot taken {dayYear(CATALOG.retrievedAt)}. Our stack&rsquo;s products are{" "}
                  {MATURITY.toLowerCase()}, so they can still be reprocessed.
                </p>
            </div>
          </div>
        </section>

        <section className="final" aria-labelledby="final-h">
          <div className="wrap">
            <h2 id="final-h">Follow the delta with us</h2>
            <p>Our code, data notes and results are open source.</p>
            <div className="actions">
              <a className="btn" href={LINKS.repo}>
                See the code on GitHub
              </a>
              <a className="link" href={LINKS.challenge}>Read the challenge</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-grid">
          <div className="foot-copy">
            <p>
              Radar data: NISAR, a joint mission of NASA and ISRO, distributed by the Alaska Satellite Facility; catalog from NASA Earthdata CMR.
              Camera photos: MODIS Terra via NASA GIBS. Globe imagery: NASA Blue Marble and VIIRS Black Marble via NASA GIBS, clouds from the
              three.js examples.
            </p>
            <p>Built by CryoCore Horizon for the NASA International Space Apps Challenge 2026. Not an official NASA or ISRO website.</p>
          </div>
          <nav className="foot-links" aria-label="Quick links">
            <Link href="/chattogram">Chattogram case study</Link>
            <a href={LINKS.challenge}>Challenge</a>
            <a href="https://nisar-docs.asf.alaska.edu/">NISAR data guide</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
