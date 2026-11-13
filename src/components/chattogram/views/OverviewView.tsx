"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Columns2, FileSearch, Map as MapIcon } from "lucide-react";
import { covers } from "@/lib/chattogram/acquisitions";
import { CASE_ID, assetUrl } from "@/lib/chattogram/case-api";
import { fmtArea, fmtDate, fmtNum, fmtSigned } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "../BackendText";
import { CaseMap } from "../CaseMap";
import { FOCUS, useCase, usePilot } from "../CaseProvider";
import { ChangeKey } from "../MapKey";
import { PrepStatus } from "../PrepStatus";
import { WardTeaser } from "../WardTeaser";

const OVERVIEW_VIEW = { lon: 91.845, lat: 22.31, zoom: 10.3 };
const STEPS = [
  { icon: MapIcon, link: "/chattogram/explore" },
  { icon: Columns2, link: "/chattogram/compare" },
  { icon: FileSearch, link: "/chattogram/evidence" },
];
const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The radar pass: the case's two calibrated images on one grid, full bleed, with the headline on top. A scan line sweeps
 * across once (the satellite's pass), then follows the reader's pointer or arrow keys. "Change map" swaps in the signed change.
 */
function RadarPass({ before, after, change, dates, children }: { before: string; after: string; change: string | null; dates: [string, string]; children: ReactNode }) {
  const t = useT();
  const s = t.overview.story;
  const [pos, setPos] = useState(100);
  const [mode, setMode] = useState<"pair" | "change">("pair");
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const touched = useRef(false);
  useEffect(() => {
    if (still()) return setPos(50);
    let raf = 0;
    const t0 = performance.now() + 500;
    const step = (now: number) => {
      if (touched.current) return; // the reader took over
      const k = Math.max(0, Math.min(1, (now - t0) / 2400));
      setPos(100 - 50 * (1 - Math.pow(1 - k, 3))); // the pass sweeps in from the right edge and settles mid-frame
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const done = setTimeout(() => !touched.current && setPos(50), 3200); // lands even where frames are throttled
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, []);
  const drag = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  return (
    <section className={`ov-pass is-${mode}`} aria-label={s.passLabel}>
      <div
        className="ov-pass-frame"
        ref={frame}
        style={{ "--pos": `${pos}%` } as CSSProperties}
        onPointerDown={(e) => {
          if (mode !== "pair" || (e.target as HTMLElement).closest("a, button")) return;
          touched.current = dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e);
        }}
        onPointerMove={(e) => dragging.current && drag(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        {/* eslint-disable @next/next/no-img-element -- the case's published layers: static PNGs on one grid */}
        <img className="ov-img" src={after} alt={t.overview.calibratedAlt(dates[1])} draggable={false} />
        <img className="ov-img ov-img-before" src={before} alt={t.overview.calibratedAlt(dates[0])} draggable={false} />
        {change && <img className="ov-img ov-img-change" src={change} alt={t.overview.heroFigAlt(`${dates[0]} – ${dates[1]}`)} draggable={false} />}
        {/* eslint-enable @next/next/no-img-element */}
        <div className="ov-scrim" aria-hidden="true" />
        <p className="ov-date is-l">{dates[0]}</p>
        <p className="ov-date is-r">{dates[1]}</p>
        <div className="ov-scan" aria-hidden="true">
          <span>
            <ArrowLeftRight size={15} />
          </span>
        </div>
        <input
          type="range"
          className="ov-range"
          min={0}
          max={100}
          value={Math.round(pos)}
          disabled={mode !== "pair"}
          onChange={(e) => {
            touched.current = true;
            setPos(Number(e.target.value));
          }}
          aria-label={s.reveal(dates[0], dates[1])}
        />
        <div className="ov-copy">{children}</div>
        <div className="ov-controls">
          <div className="ov-toggle" role="group" aria-label={s.viewLabel}>
            <button type="button" aria-pressed={mode === "pair"} onClick={() => setMode("pair")}>
              {s.viewPair}
            </button>
            {change && (
              <button type="button" aria-pressed={mode === "change"} onClick={() => setMode("change")}>
                {s.viewChange}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="ov-pass-foot">{mode === "change" ? <ChangeKey /> : <p>{s.dragHint}</p>}</div>
    </section>
  );
}

/** The front door: the radar pass with the question on it, then the measured answer, ways to check it, and its sources. */
export function OverviewView() {
  const { load, explorer, stack, before, after, href, processed, caseHref } = useCase();
  const t = useT();
  const o = t.overview;
  const s = o.story;
  const pilotLoad = usePilot();
  if (load.status !== "ready" || !stack || !before || !after) return null;

  const pc = processed.status === "ready" && processed.data.detail.status === "ready" ? processed.data : null;
  const detail = processed.status === "ready" ? processed.data.detail : null;
  const m = pc?.detail.metrics ?? null;
  const src = (id: string) => {
    const l = pc?.layers.find((x) => x.id === id);
    return l && pc ? assetUrl(CASE_ID, l, pc.detail.updated_at) : null;
  };
  const [beforeSrc, afterSrc, changeSrc] = [src("before_db"), src("after_db"), src("change_db")];
  const dates: [string, string] | null = pc ? [fmtDate(pc.detail.before.date), fmtDate(pc.detail.after.date)] : null;
  const openCase = caseHref("/chattogram/explore") ?? href("/chattogram/explore");

  const all = load.data.acquisitions;
  const overCity = load.data.stacks.filter((x) => covers(x.items[0], FOCUS.lonLat));
  const provisional = all.filter((a) => a.maturity === "Provisional").length;
  const pilot = pilotLoad.status === "ready" ? pilotLoad.data : null;
  const listed = pc?.findings.features.length ?? 0;
  const stricter = pc?.sensitivity && m ? pc.sensitivity.rows.find((r) => r.threshold_db > m.threshold_db) : undefined;
  const pct = (v: number) => (m && m.valid_common_km2 ? (v / m.valid_common_km2) * 100 : 0);
  const tiny = (v: number) => (v > 0 && v < 0.01 ? `< ${fmtNum(0.01, 2)}` : fmtArea(v));

  const copy = (
    <>
      <h1>{s.title}</h1>
      <p className="ov-lede">{dates ? s.lede(dates[0], dates[1]) : s.ledeNoCase}</p>
      <div className="ov-actions">
        <Link className="ov-btn is-primary" href={openCase}>
          {o.openCase}
        </Link>
        <Link className="ov-btn" href={href("/chattogram/compare")}>
          {o.startCompare}
        </Link>
      </div>
    </>
  );

  return (
    <div className="ov">
      {beforeSrc && afterSrc && dates ? (
        <RadarPass before={beforeSrc} after={afterSrc} change={changeSrc} dates={dates}>
          {copy}
        </RadarPass>
      ) : (
        <section className="ov-pass is-fallback">
          <div className="ov-pass-frame">
            <CaseMap label={o.mapLabel(fmtDate(after.start))} view={OVERVIEW_VIEW} image={after} imageOpacity={0.9} footprints={[after]} selected={after.conceptId} boundary={load.data.region.boundary} controls={false} />
            <div className="ov-scrim" aria-hidden="true" />
            <div className="ov-copy">{copy}</div>
          </div>
        </section>
      )}

      {pc && m ? (
        <section className="ov-answer" aria-labelledby="answer-h">
          <div className="ov-head">
            <h2 id="answer-h">{s.answerTitle}</h2>
            <p>
              <BackendText text={pc.detail.title} translated={o.caseTitles[pc.detail.id]} />, {s.answerLede(fmtNum(m.threshold_db))}
            </p>
          </div>
          <dl className="ov-nums">
            <div>
              <dd>
                {fmtArea(m.valid_common_km2)}
                <small>km²</small>
              </dd>
              <dt>{s.compared}</dt>
            </div>
            <div className="is-up">
              <dd>
                {fmtArea(m.increase_km2)}
                <small>km²</small>
              </dd>
              <dt>{s.brighter}</dt>
            </div>
            <div className="is-down">
              <dd>
                {fmtArea(m.decrease_km2)}
                <small>km²</small>
              </dd>
              <dt>{s.darker}</dt>
            </div>
          </dl>
          <div className="c-share">
            <div className="c-share-track" role="img" aria-label={o.resultShare(fmtNum(pct(m.increase_km2), 1), fmtNum(pct(m.decrease_km2), 1))}>
              <span className="is-up" style={{ width: `${pct(m.increase_km2)}%` }} />
              <span className="is-down" style={{ width: `${pct(m.decrease_km2)}%` }} />
            </div>
            <p className="c-share-legend">
              <span className="is-up">
                {o.shareUp} {fmtNum(pct(m.increase_km2), 1)}%
              </span>
              <span className="is-down">
                {o.shareDown} {fmtNum(pct(m.decrease_km2), 1)}%
              </span>
              <span>{o.shareRest(fmtNum(m.threshold_db))}</span>
            </p>
          </div>
          <ul className="c-result-checks" aria-label={o.checksLabel}>
            {m.cross_pol && (
              <li>
                <Check size={15} aria-hidden="true" />
                {o.checkHv(fmtNum(m.cross_pol.findings_same_direction), fmtNum(m.cross_pol.findings_compared), m.cross_pol.polarization)}
              </li>
            )}
            {stricter && (
              <li>
                <Check size={15} aria-hidden="true" />
                {o.checkRobust(fmtNum(stricter.listed_findings_present), fmtNum(listed), fmtNum(stricter.threshold_db))}
              </li>
            )}
            <li>
              <Check size={15} aria-hidden="true" />
              {o.checkCoverage(tiny(m.excluded_km2))}
            </li>
          </ul>
          <p className="ov-note">{o.caseHint}</p>
        </section>
      ) : (
        <section className="ov-answer" aria-label={o.casePending}>
          <PrepStatus />
        </section>
      )}

      <WardTeaser />

      <section className="ov-check" aria-labelledby="steps-h">
        <h2 id="steps-h">{s.checkTitle}</h2>
        <div className="ov-steps">
          {STEPS.map(({ icon: Icon, link }, i) => (
            <Link key={link} href={href(link)} className="ov-step">
              <Icon size={20} aria-hidden="true" />
              <h3>{o.steps[i].title}</h3>
              <p>{o.steps[i].body}</p>
              <span>{o.steps[i].cta}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="ov-data" aria-labelledby="data-h">
        <h2 id="data-h">{s.dataTitle}</h2>
        <ul>
          <li>{s.dataScenes(fmtNum(all.length))}</li>
          {explorer && <li>{s.dataDays(fmtNum(explorer.summary.observation_days))}</li>}
          <li>{s.dataStacks(fmtNum(overCity.length))}</li>
          <li>{s.dataProvisional(fmtNum(provisional), fmtNum(all.length))}</li>
          {pilot && (
            <li>
              <Link href={href("/chattogram/processed")}>{s.dataPilot(fmtNum(pilot.statistics.HHHH.common_area_km2, 1), fmtSigned(pilot.statistics.HHHH.median_change_db))}</Link>
            </li>
          )}
          <li>
            <Link href={href("/chattogram/about")}>{o.canCant}</Link>
          </li>
        </ul>
        {detail && !pc && <p className="ov-note">{o.casePending}</p>}
      </section>
    </div>
  );
}
