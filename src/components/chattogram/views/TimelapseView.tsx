"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudRain, Hand, Pause, Play, SkipBack, SkipForward, Sun, Droplets } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { useCase } from "../CaseProvider";

const PLACES = [
  { id: "coast", en: "Whole coast", bn: "পুরো উপকূল", view: null },
  { id: "city", en: "Chattogram city", bn: "চট্টগ্রাম শহর", view: { lon: 91.83, lat: 22.345, zoom: 10.6 } },
  { id: "mouth", en: "Karnaphuli mouth", bn: "কর্ণফুলী মোহনা", view: { lon: 91.83, lat: 22.27, zoom: 11.6 } },
  { id: "sandwip", en: "Sandwip", bn: "সন্দ্বীপ", view: { lon: 91.47, lat: 22.5, zoom: 10.2 } },
] as const;

const T = {
  en: {
    title: "The monsoon, pass by pass",
    pass: (i: number, n: number) => `Pass ${i} of ${n}`, week: "mm of rain in the week before", mm: "mm",
    play: "Play", pause: "Pause", prev: "Previous pass", next: "Next pass", speed: "Speed", stack: "Orbit track",
    hold: "Hold to see the first pass", holding: (d: string) => `Showing the first pass, ${d}`,
    wettest: "Wettest week", driest: "Driest week", zoom: "Go to", strength: "Radar",
    cue: {
      wet: "A very wet week. Look for dark patches spreading on low fields and along rivers: smooth, standing water sends the radar signal away.",
      mid: "Some rain this week. Rivers and ponds stay dark; fields change slowly with the crops.",
      dry: "A dry week. Dark areas shrink back to rivers, ponds and the sea; bright spots are towns, ships and trees.",
    },
    note: "Each frame is a NISAR radar quicklook from the same orbit, so the view angle matches. Bars: daily rain at Chattogram (NASA POWER, modelled). Space plays or pauses; arrow keys step.",
  },
  bn: {
    title: "পর্যবেক্ষণে পর্যবেক্ষণে পুরো বর্ষা",
    pass: (i: number, n: number) => `${fmtNum(n)}টির মধ্যে ${fmtNum(i)} নম্বর পর্যবেক্ষণ`, week: "মিমি বৃষ্টি, আগের সপ্তাহে", mm: "মিমি",
    play: "চালান", pause: "থামান", prev: "আগের পর্যবেক্ষণ", next: "পরের পর্যবেক্ষণ", speed: "গতি", stack: "কক্ষপথ",
    hold: "প্রথম পর্যবেক্ষণ দেখতে চেপে ধরুন", holding: (d: string) => `প্রথম পর্যবেক্ষণ দেখানো হচ্ছে, ${d}`,
    wettest: "সবচেয়ে বৃষ্টির সপ্তাহ", driest: "সবচেয়ে শুকনো সপ্তাহ", zoom: "যান", strength: "রাডার",
    cue: {
      wet: "খুব বৃষ্টির সপ্তাহ। নিচু জমি আর নদীর ধারে অন্ধকার অংশ ছড়াচ্ছে কিনা দেখুন: মসৃণ জমে থাকা পানি রাডারের সংকেত অন্যদিকে ফিরিয়ে দেয়।",
      mid: "এ সপ্তাহে কিছু বৃষ্টি। নদী আর পুকুর অন্ধকার থাকে; জমি ফসলের সাথে ধীরে বদলায়।",
      dry: "শুকনো সপ্তাহ। অন্ধকার অংশ নদী, পুকুর আর সাগরে ফিরে যায়; উজ্জ্বল বিন্দু হলো শহর, জাহাজ আর গাছপালা।",
    },
    note: "প্রতিটি ফ্রেম একই কক্ষপথের নাইসার রাডার ছবি, তাই দেখার কোণ একই। দণ্ড: চট্টগ্রামের দৈনিক বৃষ্টি (নাসা পাওয়ার, মডেল)। স্পেস চাপলে চলে/থামে; তীর-বোতামে এক ধাপ।",
  },
};

export function TimelapseView() {
  const lang = useLang();
  const s = T[lang];
  const { load, rain } = useCase();
  const stacks = useMemo(
    () => (load.status === "ready" ? load.data.stacks.filter((k) => k.items.some((a) => a.frozen?.src)).sort((a, b) => b.items.length - a.items.length) : []),
    [load],
  );
  const [stackId, setStackId] = useState<string | null>(null);
  const stack = stacks.find((k) => k.id === stackId) ?? stacks[0];
  const frames = useMemo(() => (stack ? [...stack.items].sort((a, b) => a.start.localeCompare(b.start)) : []), [stack]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [hold, setHold] = useState(false);
  const [place, setPlace] = useState<(typeof PLACES)[number]["id"]>("coast");
  const [opacity, setOpacity] = useState(92);

  useEffect(() => {
    if (!playing || hold || frames.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % frames.length), 1700 / speed);
    return () => clearInterval(id);
  }, [playing, hold, speed, frames.length]);
  useEffect(() => {
    // preload every frame so playback doesn't flicker
    frames.forEach((a) => { if (a.frozen?.src) new Image().src = a.frozen.src; });
  }, [frames]);
  useEffect(() => {
    const n = frames.length;
    if (!n) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === " ") { e.preventDefault(); setPlaying((v) => !v); }
      if (e.key === "ArrowRight") { setPlaying(false); setI((v) => (v + 1) % n); }
      if (e.key === "ArrowLeft") { setPlaying(false); setI((v) => (v - 1 + n) % n); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [frames.length]);

  const days = useMemo(() => rain?.days ?? [], [rain]);
  const weekOf = useMemo(() => {
    return (day: string) => {
      const t = Date.parse(day);
      return days.filter((d) => { const x = Date.parse(d.date); return x <= t && x > t - 7 * 864e5; }).reduce((a, d) => a + (d.mm ?? 0), 0);
    };
  }, [days]);
  const weeks = useMemo(() => frames.map((a) => weekOf(a.day)), [frames, weekOf]);

  if (!stack || !frames.length) return null;
  const at_i = Math.min(i, frames.length - 1);
  const cur = frames[at_i];
  const shown = hold ? frames[0] : cur;
  const t0 = Date.parse(days[0]?.date ?? frames[0].day), t1 = Date.parse(days.at(-1)?.date ?? frames.at(-1)!.day);
  const at = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - t0) / (t1 - t0 || 1)) * 100));
  const max = Math.max(1, ...days.map((d) => d.mm ?? 0));
  const curT = Date.parse(cur.day);
  const week = weeks[at_i];
  const wettest = weeks.indexOf(Math.max(...weeks));
  const driest = weeks.indexOf(Math.min(...weeks));
  const cue = week >= 100 ? "wet" : week >= 25 ? "mid" : "dry";
  const center = cur.footprint.reduce((a, p) => [a[0] + p[0] / cur.footprint.length, a[1] + p[1] / cur.footprint.length], [0, 0]);
  const coast = { lon: (center[0] + 91.83) / 2, lat: (center[1] + 22.35) / 2, zoom: 8.6 };
  const view = PLACES.find((p) => p.id === place)?.view ?? coast;
  const go = (k: number) => { setPlaying(false); setI(k); };

  return (
    <div className={`tl is-${cue}${hold ? " is-holding" : ""}`}>
      <div className="tl-map">
        <CaseMap label={s.title} view={view} image={shown} imageOpacity={opacity / 100} controls={false} />
        <div className="tl-vignette" aria-hidden="true" />
      </div>

      <header className="tl-head">
        <h1>{s.title}</h1>
        <div className="tl-places" role="group" aria-label={s.zoom}>
          {PLACES.map((p) => <button key={p.id} type="button" aria-pressed={place === p.id} onClick={() => setPlace(p.id)}>{p[lang]}</button>)}
        </div>
      </header>

      <div className="tl-date" aria-live="polite">
        <strong key={shown.day}>{fmtDate(shown.day)}</strong>
        <span>{hold ? s.holding(fmtDate(frames[0].day)) : s.pass(at_i + 1, frames.length)}</span>
        {!hold && <span className="tl-rain"><CloudRain size={16} /> <b>{fmtNum(week, 0)}</b> {s.week}</span>}
      </div>

      {!hold && <p className="tl-cue" key={`${cur.day}-${cue}`}>{s.cue[cue]}</p>}

      <div className="tl-dock">
        <div className="tl-controls">
          <button type="button" onClick={() => go((at_i - 1 + frames.length) % frames.length)} aria-label={s.prev}><SkipBack size={18} /></button>
          <button type="button" className="is-play" onClick={() => setPlaying((v) => !v)} aria-label={playing ? s.pause : s.play}>{playing ? <Pause size={22} /> : <Play size={22} />}</button>
          <button type="button" onClick={() => go((at_i + 1) % frames.length)} aria-label={s.next}><SkipForward size={18} /></button>
          <button
            type="button"
            className="tl-hold"
            onPointerDown={() => setHold(true)}
            onPointerUp={() => setHold(false)}
            onPointerLeave={() => setHold(false)}
            onKeyDown={(e) => e.key === "Enter" && setHold(true)}
            onKeyUp={() => setHold(false)}
          >
            <Hand size={16} aria-hidden="true" /> {s.hold}
          </button>
          <button type="button" className="tl-jump is-wet" onClick={() => go(wettest)}><Droplets size={15} aria-hidden="true" /> {s.wettest}</button>
          <button type="button" className="tl-jump" onClick={() => go(driest)}><Sun size={15} aria-hidden="true" /> {s.driest}</button>
          <label className="tl-strength">
            <span>{s.strength}</span>
            <input type="range" min={20} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
          </label>
          <div className="tl-speed" role="group" aria-label={s.speed}>
            {[0.5, 1, 2].map((v) => <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)}>{fmtNum(v)}×</button>)}
          </div>
          {stacks.length > 1 && (
            <select aria-label={s.stack} value={stack.id} onChange={(e) => { setStackId(e.target.value); setI(0); }}>
              {stacks.map((k) => <option key={k.id} value={k.id}>{k.id} · {fmtNum(k.items.length)}</option>)}
            </select>
          )}
        </div>
        <div className="tl-track">
          {days.map((d) => (
            <i key={d.date} className={Date.parse(d.date) <= curT ? "is-past" : ""} style={{ left: `${at(d.date)}%`, height: `${Math.max(2, ((d.mm ?? 0) / max) * 100)}%` }} />
          ))}
          {frames.map((a, k) => (
            <button key={a.conceptId} type="button" className={`tl-pass${k === at_i ? " is-on" : ""}`} style={{ left: `${at(a.day)}%` }} onClick={() => go(k)} aria-label={fmtDate(a.day)} />
          ))}
          <span className="tl-head-line" style={{ left: `${at(cur.day)}%` }} />
        </div>
        <p className="tl-note">{s.note}</p>
      </div>
    </div>
  );
}
