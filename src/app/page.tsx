import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { HeroGlobe } from "@/components/HeroGlobe";
import { DaylightChart } from "@/components/DaylightChart";
import { RadarSteps } from "@/components/RadarSteps";
import { CompareSlider } from "@/components/CompareSlider";
import { FjordIllustration } from "@/components/FjordIllustration";

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
  { name: "Add name", role: "Glacier science and story" },
  { name: "Add name", role: "Design and video" },
];

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
            <h1>It&rsquo;s polar night over Greenland&rsquo;s fastest glacier. Radar still sees it.</h1>
            <p className="lede">
              You&rsquo;re riding beside NISAR, the NASA–ISRO radar satellite, 747 km up. Its beam lights a 240 km strip of ice that no camera
              could see in the dark. We turn those images into a live record of how fast Jakobshavn Glacier moves.
            </p>
            <div className="actions">
              <Link className="btn" href="/dashboard">
                Open the ice dashboard
                <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
              <a className="link" href="#radar">How radar sees ice</a>
            </div>
            <p className="hero-note">The pass is simulated from NISAR&rsquo;s real orbit, not its actual schedule. Spacecraft and Earth are to scale.</p>
          </div>
          <a className="hero-scroll" href="#dark">
            <span>Scroll to story ↓</span>
            <span className="hero-scroll-line" aria-hidden="true" />
          </a>
        </section>

        <section className="section" id="dark" aria-labelledby="dark-h">
          <div className="wrap">
            <div className="intro">
              <div className="intro-head">
                <p className="section-kicker">01 / THE PROBLEM</p>
                <h2 id="dark-h">For weeks each winter, the sun never rises over the glacier</h2>
              </div>
              <div className="prose">
                <p>
                  Ilulissat sits about 300 km north of the Arctic Circle. From late November to mid-January there is no sunrise, and cloud
                  covers the fjord for much of the rest of the year. Satellite cameras need sunlight and a clear sky.
                </p>
                <p>Radar brings its own signal. NISAR sees the ice on every pass, in the dark and through cloud.</p>
              </div>
            </div>
            <DaylightChart />
          </div>
        </section>

        <section className="section" id="radar" aria-labelledby="radar-h">
          <div className="wrap">
            <div className="intro">
              <div className="intro-head">
                <p className="section-kicker">02 / HOW NISAR SEES</p>
                <h2 id="radar-h">How NISAR measures a glacier it can&rsquo;t see</h2>
              </div>
              <p className="prose">Four steps turn microwave echoes into a map of moving ice. Pick a step to see it.</p>
            </div>
            <RadarSteps />
          </div>
        </section>

        <section className="section section-deep" id="glacier" aria-labelledby="glacier-h">
          <div className="wrap">
            <div className="intro">
              <div className="intro-head">
                <p className="section-kicker">03 / THE GLACIER</p>
                <h2 id="glacier-h">Sermeq Kujalleq, also called Jakobshavn Glacier</h2>
              </div>
              <p className="prose">69.2° N, 49.9° W. It drains the west of the Greenland Ice Sheet into the Ilulissat Icefjord and Disko Bay.</p>
            </div>
            <div className="glacier-grid">
              <figure>
                <CompareSlider
                  before={<FjordIllustration id="a" front={430} flow={0} />}
                  after={<FjordIllustration id="b" front={452} flow={16} />}
                  beforeLabel="Pass 1"
                  afterLabel="Pass 2, 12 days later"
                  badge="12-day baseline · ~480 m front advance"
                />
                <figcaption className="note">
                  Illustration, not data. During the hackathon this becomes a pair of real NISAR radar images of the glacier front from the
                  Alaska Satellite Facility.
                </figcaption>
              </figure>
              <div>
                <dl className="specs">
                  <div>
                    <dt>Flow speed</dt>
                    <dd>Up to 40 m a day</dd>
                  </div>
                  <div>
                    <dt>Ice calved each year</dt>
                    <dd>Over 35 km³</dd>
                  </div>
                  <div>
                    <dt>Share of Greenland&rsquo;s calf ice</dt>
                    <dd>About 10%</dd>
                  </div>
                  <div>
                    <dt>UNESCO World Heritage</dt>
                    <dd>Since 2004</dd>
                  </div>
                </dl>
                <p className="source">
                  Source: <a href="https://whc.unesco.org/en/list/1149/">UNESCO World Heritage Centre, Ilulissat Icefjord</a>
                </p>
              </div>
            </div>

            <div className="build">
              <h3>What our app will measure</h3>
              <ul>
                <li>
                  <span className="build-tag">VELOCITY · M/DAY</span>
                  <strong>Flow speed</strong>
                  <span>How fast the ice moves near the front, from pairs of NISAR passes 12 days apart.</span>
                </li>
                <li>
                  <span className="build-tag">TERMINUS · ΔKM</span>
                  <strong>Calving front</strong>
                  <span>Where the glacier ends on each date, and how far it advances or retreats.</span>
                </li>
                <li>
                  <span className="build-tag">ANNUAL CYCLE</span>
                  <strong>Seasonal rhythm</strong>
                  <span>Whether the glacier speeds up during summer melt and slows in winter.</span>
                </li>
              </ul>
              <div className="actions build-cta">
                <Link className="btn" href="/dashboard">
                  Open the ice dashboard
                  <span className="btn-arrow" aria-hidden="true">→</span>
                </Link>
                <span className="note">Running on sample data until the hackathon, 14–15 November 2026.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="team" aria-labelledby="team-h">
          <div className="wrap intro">
            <div className="intro-head">
              <p className="section-kicker">04 / THE TEAM</p>
              <h2 id="team-h">The team</h2>
            </div>
            <ul className="team">
              {TEAM.map((m, i) => (
                <li key={i}>
                  <span className="team-idx">{String(i + 1).padStart(2, "0")}</span>
                  <strong>{m.name}</strong>
                  <span className="team-role">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="final" aria-labelledby="final-h">
          <div className="wrap">
            <h2 id="final-h">Follow the glacier with us</h2>
            <p>Our code, data notes and results are open source.</p>
            <div className="actions">
              <a className="btn" href={LINKS.repo}>
                See the code on GitHub
                <span className="btn-arrow" aria-hidden="true">→</span>
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
              Radar data: NISAR, a joint mission of NASA and ISRO, distributed by the Alaska Satellite Facility. Earth imagery: NASA Blue Marble
              and VIIRS Black Marble from NASA GIBS; cloud layer from the three.js examples. Glacier facts: UNESCO.
            </p>
            <p>Built by CryoCore Horizon for the NASA International Space Apps Challenge 2026. Not an official NASA or ISRO website.</p>
          </div>
          <nav className="foot-links" aria-label="Quick links">
            <Link href="/dashboard">Dashboard</Link>
            <a href={LINKS.challenge}>Challenge</a>
            <a href="https://whc.unesco.org/en/list/1149/">UNESCO</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
