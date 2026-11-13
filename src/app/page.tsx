import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { SiteNav } from "@/components/SiteNav";
import { HeroGlobe } from "@/components/HeroGlobe";
import { RadarSteps } from "@/components/RadarSteps";
import { CloudCompare, type CloudPair } from "@/components/CloudCompare";
import { CASE, CATALOG, PASSES, STACKS, TRACKS, day, dayYear, gaps, localTime, maturityLabel, mode } from "@/lib/chattogram/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// TODO(team): fill these in before sharing.
const LINKS = {
  repo: "https://github.com/Phanthom-Mekat/CryoCore-Horizon",
  challenge: "https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/",
};
const TEAM = [
  { name: "Add name", role: "Radar data and processing" },
  { name: "Add name", role: "Web app and visualisation" },
  { name: "Add name", role: "Delta science and story" },
  { name: "Add name", role: "Design and video" },
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
            <p className="hero-note">The pass is simulated from NISAR&rsquo;s orbit, not its actual schedule. Spacecraft and Earth are to scale.</p>
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

            <div className="delta-grid">
              <div>
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

              <div className="build">
                <h3>Where the project stands</h3>
                <ul>
                  <li data-state="done">
                    <span className="build-tag">Done</span>
                    <strong>Real NISAR catalog and pictures</strong>
                    <span>
                      {PASSES.length} scenes from NASA&rsquo;s catalog, and quick-look radar images for all {CASE.length} passes in our stack.
                    </span>
                  </li>
                  <li data-state="next">
                    <span className="build-tag">Next</span>
                    <strong>Calibrated change between passes</strong>
                    <span>Download the full GCOV files with a NASA Earthdata login, and measure how much the radar echo changed between dates.</span>
                  </li>
                  <li data-state="later">
                    <span className="build-tag">After that</span>
                    <strong>Candidate water-change map</strong>
                    <span>Mark where water likely spread or pulled back, and check it against independent data before calling anything a flood.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="actions delta-cta">
              <Link className="btn" href="/chattogram">
                Explore the radar map
              </Link>
            </div>
          </div>
        </section>

        <section className="section" id="team" aria-labelledby="team-h">
          <div className="wrap intro">
            <h2 id="team-h">The team</h2>
            <ul className="team">
              {TEAM.map((m, i) => (
                <li key={i}>
                  <strong>{m.name}</strong>
                  <span className="team-role">{m.role}</span>
                </li>
              ))}
            </ul>
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
