"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Backpack, Check, CloudRain, Droplets, Phone, Siren, Thermometer, Waves, Wind } from "lucide-react";
import { fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";

// tide at the Karnaphuli mouth (Open-Meteo Marine's nearest sea cell); the whole city drains through it
const TIDE_AT = { lat: 22.27, lon: 91.82 };
type Hour = { t: string; rain: number; prob: number; tide: number | null };
type Now = { temp: number; hum: number; wind: number; rain: number; code: number };
type Risk = "high" | "medium" | "low";

const T = {
  en: {
    today: "Today", in: (p: string) => `in ${p}`, chattogram: "Chattogram", here: "your location",
    risk: { high: "High waterlogging risk", medium: "Some waterlogging risk", low: "Low waterlogging risk" } as Record<Risk, string>,
    why: (mm: string, tide: string | null, near: boolean) =>
      `${mm} mm of rain expected in the next 24 hours${tide ? `; next high tide at ${tide}` : ""}${near ? ". The heaviest rain falls close to high tide, when drains can't empty into the river." : "."}`,
    temp: "Temperature", hum: "Humidity", wind: "Wind", rainNow: "Rain now", next48: "Next 48 hours", rainLbl: "Rain (mm/h)", tideLbl: "Tide (m)", now: "Now", high: "High",
    est: "Estimate from the Open-Meteo forecast and modelled tide, not an official warning. Follow BMD and the City Corporation.",
    weather: (c: number) => (c >= 95 ? "Thunderstorm" : c >= 80 ? "Showers" : c >= 61 ? "Rain" : c >= 51 ? "Drizzle" : c >= 45 ? "Fog" : c >= 2 ? "Cloudy" : "Clear"),
  },
  bn: {
    today: "আজ", in: (p: string) => `${p}-এ`, chattogram: "চট্টগ্রাম", here: "আপনার অবস্থান",
    risk: { high: "জলাবদ্ধতার উচ্চ ঝুঁকি", medium: "জলাবদ্ধতার কিছু ঝুঁকি", low: "জলাবদ্ধতার কম ঝুঁকি" } as Record<Risk, string>,
    why: (mm: string, tide: string | null, near: boolean) =>
      `আগামী ২৪ ঘণ্টায় ${mm} মিমি বৃষ্টির সম্ভাবনা${tide ? `; পরের জোয়ার ${tide}-এ` : ""}${near ? "। সবচেয়ে ভারী বৃষ্টি জোয়ারের কাছাকাছি সময়ে, যখন নালার পানি নদীতে নামতে পারে না।" : "।"}`,
    temp: "তাপমাত্রা", hum: "আর্দ্রতা", wind: "বাতাস", rainNow: "এখন বৃষ্টি", next48: "আগামী ৪৮ ঘণ্টা", rainLbl: "বৃষ্টি (মিমি/ঘণ্টা)", tideLbl: "জোয়ার-ভাটা (মি)", now: "এখন", high: "জোয়ার",
    est: "ওপেন-মিটিও পূর্বাভাস আর মডেল করা জোয়ার থেকে অনুমান, সরকারি সতর্কবার্তা নয়। আবহাওয়া অধিদপ্তর ও সিটি কর্পোরেশনের নির্দেশনা মানুন।",
    weather: (c: number) => (c >= 95 ? "বজ্রঝড়" : c >= 80 ? "দমকা বৃষ্টি" : c >= 61 ? "বৃষ্টি" : c >= 51 ? "গুঁড়ি গুঁড়ি বৃষ্টি" : c >= 45 ? "কুয়াশা" : c >= 2 ? "মেঘলা" : "পরিষ্কার"),
  },
};

const BN = "০১২৩৪৫৬৭৮৯";
const clock = (iso: string, bn: boolean) => { const s = iso.slice(11, 16); return bn ? s.replace(/\d/g, (d) => BN[+d]) : s; };

export function TodayPanel({ at, place }: { at: [number, number]; place: string | null }) {
  const lang = useLang();
  const s = T[lang];
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [now, setNow] = useState<Now | null>(null);
  const key = `${at[0].toFixed(2)},${at[1].toFixed(2)}`;

  useEffect(() => {
    let dead = false;
    const [lon, lat] = at;
    Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code&hourly=precipitation,precipitation_probability&timezone=Asia%2FDhaka&forecast_days=3`).then((r) => r.json()),
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${TIDE_AT.lat}&longitude=${TIDE_AT.lon}&hourly=sea_level_height_msl&timezone=Asia%2FDhaka&forecast_days=3`).then((r) => r.json()).catch(() => null),
    ]).then(([w, m]) => {
      if (dead) return;
      const c = w.current;
      setNow({ temp: c.temperature_2m, hum: c.relative_humidity_2m, wind: c.wind_speed_10m, rain: c.precipitation, code: c.weather_code });
      const tide = new Map<string, number>((m?.hourly?.time ?? []).map((t: string, i: number) => [t, m.hourly.sea_level_height_msl[i]]));
      const start = w.hourly.time.findIndex((t: string) => t >= c.time.slice(0, 13));
      setHours(w.hourly.time.slice(start, start + 48).map((t: string, i: number) => ({
        t, rain: w.hourly.precipitation[start + i] ?? 0, prob: w.hourly.precipitation_probability?.[start + i] ?? 0, tide: tide.get(t) ?? null,
      })));
    }).catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const a = useMemo(() => {
    if (!hours?.length) return null;
    const highs = hours.map((h, i) => i).filter((i) => i > 0 && i < hours.length - 1 && hours[i].tide != null && hours[i].tide! > (hours[i - 1].tide ?? -9) && hours[i].tide! >= (hours[i + 1].tide ?? -9));
    const day = hours.slice(0, 24);
    const sum = day.reduce((x, h) => x + h.rain, 0);
    const peak = day.reduce((b, h, i) => (h.rain > day[b].rain ? i : b), 0);
    const near = day[peak].rain >= 4 && highs.some((i) => Math.abs(i - peak) <= 2);
    const risk: Risk = sum >= 40 || (near && sum >= 20) ? "high" : sum >= 10 || near ? "medium" : "low";
    return { highs, sum, peak, near, risk, maxRain: Math.max(2, ...hours.map((h) => h.rain)) };
  }, [hours]);

  const tides = hours?.map((h) => h.tide).filter((v): v is number => v != null) ?? [];
  const tMin = Math.min(...tides), tMax = Math.max(...tides);
  const W = 960, H = 190, bw = W / 48;
  const ty = (v: number) => 20 + (1 - (v - tMin) / (tMax - tMin || 1)) * (H - 70);
  const tidePath = hours?.map((h, i) => (h.tide == null ? "" : `${i === 0 ? "M" : "L"}${(i + 0.5) * bw},${ty(h.tide)}`)).join(" ") ?? "";
  const label = place ? (place === "Chattogram" ? s.chattogram : place) : s.here;
  const nextHigh = a?.highs[0] != null ? clock(hours![a.highs[0]].t, lang === "bn") : null;

  return (
    <section className={`ma-today is-${a?.risk ?? "low"}`} aria-live="polite">
      <div className="ma-today-head">
        <div>
          <p className="ma-eyebrow"><CloudRain size={14} /> {s.today} · {s.in(label)}</p>
          <h2>{a ? <><AlertTriangle size={26} aria-hidden="true" /> {s.risk[a.risk]}</> : "…"}</h2>
          {a && <p className="ma-sub">{s.why(fmtNum(a.sum, 0), nextHigh, a.near)}</p>}
        </div>
        {now && (
          <dl className="ma-now">
            <div><dt><Thermometer size={16} /> {s.temp}</dt><dd>{fmtNum(now.temp, 0)}°<small>{s.weather(now.code)}</small></dd></div>
            <div><dt><Droplets size={16} /> {s.hum}</dt><dd>{fmtNum(now.hum, 0)}%</dd></div>
            <div><dt><Wind size={16} /> {s.wind}</dt><dd>{fmtNum(now.wind, 0)}<small>km/h</small></dd></div>
            <div><dt><CloudRain size={16} /> {s.rainNow}</dt><dd>{fmtNum(now.rain, 1)}<small>mm</small></dd></div>
          </dl>
        )}
      </div>
      {hours && a && (
        <figure className="ma-chart">
          <figcaption><span>{s.next48}</span><i className="is-rain" /> {s.rainLbl} <i className="is-tide" /> {s.tideLbl}</figcaption>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${s.next48}: ${s.rainLbl}, ${s.tideLbl}`}>
            <defs>
              <linearGradient id="ma-tide-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity=".35" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
            </defs>
            {[...Array(48)].map((_, i) => (i % 6 === 0 ? <line key={i} x1={i * bw} x2={i * bw} y1={10} y2={H - 30} className="ma-grid-l" /> : null))}
            {tides.length > 1 && <path d={`${tidePath} L${47.5 * bw},${H - 30} L${0.5 * bw},${H - 30} Z`} fill="url(#ma-tide-fill)" />}
            {tides.length > 1 && <path d={tidePath} className="ma-tide-l" />}
            {hours.map((h, i) => {
              const bh = (h.rain / a.maxRain) * (H - 60);
              return <rect key={h.t} x={i * bw + 2} width={bw - 4} y={H - 30 - bh} height={bh} rx={3} className={h.rain >= 8 ? "ma-bar is-heavy" : "ma-bar"}><title>{`${clock(h.t, lang === "bn")} · ${fmtNum(h.rain, 1)} mm · ${fmtNum(h.prob)}%`}</title></rect>;
            })}
            {a.highs.map((i) => (
              <g key={i} transform={`translate(${(i + 0.5) * bw},${ty(hours[i].tide!)})`}>
                <circle r={5} className="ma-hi-dot" />
                <text y={-10} textAnchor="middle" className="ma-hi-t">{s.high} {clock(hours[i].t, lang === "bn")}</text>
              </g>
            ))}
            <line x1={bw / 2} x2={bw / 2} y1={6} y2={H - 30} className="ma-now-l" />
            {hours.map((h, i) => (i % 6 === 0 ? <text key={h.t} x={i * bw + 4} y={H - 10} className="ma-axis">{i === 0 ? s.now : clock(h.t, lang === "bn")}</text> : null))}
          </svg>
          <p className="ma-fine">{s.est}</p>
        </figure>
      )}
    </section>
  );
}

const P = {
  en: {
    ready: "Be ready", calls: "One-tap emergency numbers",
    nums: [
      { n: "999", l: "National emergency", d: "Police, fire, ambulance" },
      { n: "1090", l: "Disaster warning", d: "Free weather & flood alerts (DDM)" },
      { n: "16163", l: "Fire Service & Civil Defence", d: "Rescue, fire" },
      { n: "333", l: "National helpline", d: "Government information & relief" },
    ],
    bag: "Emergency bag", bagSub: (a: number, b: number) => `${a} of ${b} packed · saved on this phone`,
    items: ["NID, land papers & certificates in a plastic bag", "Drinking water for 3 days", "ORS & water purifying tablets", "Torch, spare batteries, power bank", "Dry food: chira, muri, biscuits", "Regular medicines & first-aid kit", "Some cash & a written phone list", "Matches/lighter in a sealed bag"],
    phases: [
      { k: "before", l: "Before", tips: ["Clean the drain in front of your house", "Raise valuables, rice and seed above the highest flood mark", "Know the way to the nearest shelter", "Charge phones; save 999 and 1090"] },
      { k: "during", l: "During", tips: ["Switch off the main electricity before water enters", "Don't walk or drive through moving water", "Keep children away from open drains and canals", "Boil or purify all drinking water"] },
      { k: "after", l: "After", tips: ["Stay out of water near fallen power lines", "Clean and dry the house; bleach the floors", "Watch for diarrhoea and fever; use ORS early", "Report damage to your ward councillor"] },
    ],
  },
  bn: {
    ready: "প্রস্তুত থাকুন", calls: "এক চাপে জরুরি নম্বর",
    nums: [
      { n: "৯৯৯", l: "জাতীয় জরুরি সেবা", d: "পুলিশ, ফায়ার, অ্যাম্বুলেন্স", tel: "999" },
      { n: "১০৯০", l: "দুর্যোগের পূর্বাভাস", d: "বিনামূল্যে আবহাওয়া ও বন্যার সতর্কবার্তা", tel: "1090" },
      { n: "১৬১৬৩", l: "ফায়ার সার্ভিস ও সিভিল ডিফেন্স", d: "উদ্ধার, আগুন", tel: "16163" },
      { n: "৩৩৩", l: "জাতীয় তথ্য বাতায়ন", d: "সরকারি তথ্য ও ত্রাণ", tel: "333" },
    ],
    bag: "জরুরি ব্যাগ", bagSub: (a: number, b: number) => `${fmtNum(b)}টির মধ্যে ${fmtNum(a)}টি গোছানো · এই ফোনে সংরক্ষিত`,
    items: ["এনআইডি, জমির দলিল ও সনদ প্লাস্টিকের ব্যাগে", "৩ দিনের খাবার পানি", "ওরস্যালাইন ও পানি বিশুদ্ধকরণ ট্যাবলেট", "টর্চ, বাড়তি ব্যাটারি, পাওয়ার ব্যাংক", "শুকনো খাবার: চিড়া, মুড়ি, বিস্কুট", "নিয়মিত ওষুধ ও প্রাথমিক চিকিৎসার বাক্স", "কিছু টাকা ও লেখা ফোন নম্বরের তালিকা", "সিল করা ব্যাগে দিয়াশলাই/লাইটার"],
    phases: [
      { k: "before", l: "আগে", tips: ["বাড়ির সামনের নালা পরিষ্কার করুন", "মূল্যবান জিনিস, চাল ও বীজ সর্বোচ্চ পানির দাগের ওপরে রাখুন", "কাছের আশ্রয়কেন্দ্রের পথ জেনে রাখুন", "ফোন চার্জ দিন; ৯৯৯ ও ১০৯০ সেভ করুন"] },
      { k: "during", l: "চলাকালীন", tips: ["পানি ঢোকার আগে বিদ্যুতের মূল সুইচ বন্ধ করুন", "স্রোতের পানিতে হাঁটবেন না বা গাড়ি চালাবেন না", "শিশুদের খোলা নালা ও খাল থেকে দূরে রাখুন", "সব খাবার পানি ফুটিয়ে বা বিশুদ্ধ করে খান"] },
      { k: "after", l: "পরে", tips: ["ছিঁড়ে পড়া বিদ্যুতের তারের কাছের পানি এড়িয়ে চলুন", "ঘর পরিষ্কার ও শুকনো করুন; মেঝেতে ব্লিচ দিন", "ডায়রিয়া ও জ্বরের দিকে খেয়াল রাখুন; শুরুতেই স্যালাইন খান", "ক্ষয়ক্ষতির খবর ওয়ার্ড কাউন্সিলরকে জানান"] },
    ],
  },
};

const BAG_KEY = "cryocore-myarea-bag";

export function Preparedness() {
  const lang = useLang();
  const s = P[lang];
  const [done, setDone] = useState<number[]>([]);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(BAG_KEY) ?? "[]")); } catch {}
  }, []);
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    try { localStorage.setItem(BAG_KEY, JSON.stringify(next)); } catch {}
  };
  const pct = (done.length / s.items.length) * 100;

  return (
    <section className="ma-ready" aria-labelledby="ready-h">
      <h2 id="ready-h"><Siren size={22} aria-hidden="true" /> {s.ready}</h2>
      <div className="ma-ready-grid">
        <div className="ma-panel">
          <h3><Phone size={18} /> {s.calls}</h3>
          <div className="ma-calls">
            {s.nums.map((x) => (
              <a key={x.n} href={`tel:${"tel" in x ? x.tel : x.n}`} className="ma-call">
                <strong>{x.n}</strong>
                <span>{x.l}</span>
                <small>{x.d}</small>
              </a>
            ))}
          </div>
        </div>

        <div className="ma-panel">
          <div className="ma-bag-head">
            <div className="ma-ring" style={{ ["--p" as string]: pct }}><Backpack size={22} /></div>
            <div><h3>{s.bag}</h3><p className="ma-sub">{s.bagSub(done.length, s.items.length)}</p></div>
          </div>
          <ul className="ma-check">
            {s.items.map((it, i) => (
              <li key={i}>
                <button type="button" aria-pressed={done.includes(i)} onClick={() => toggle(i)}>
                  <span className="ma-box">{done.includes(i) && <Check size={14} />}</span>{it}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ma-panel">
          <div className="cl-seg ma-phase" role="tablist">
            {s.phases.map((p, i) => (
              <button key={p.k} type="button" role="tab" aria-selected={phase === i} aria-pressed={phase === i} onClick={() => setPhase(i)}>{p.l}</button>
            ))}
          </div>
          <ol className="ma-tips" key={phase}>
            {s.phases[phase].tips.map((t, i) => <li key={i} style={{ animationDelay: `${i * 60}ms` }}><Waves size={16} aria-hidden="true" /> {t}</li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}
