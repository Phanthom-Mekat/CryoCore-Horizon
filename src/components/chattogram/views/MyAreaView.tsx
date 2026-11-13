"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudRain, Hospital, LocateFixed, MapPin, Navigation, Pause, Share2, Shield, Sprout, Volume2, Download, Route, Droplets, Sparkles } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { useCase } from "../CaseProvider";
import { Preparedness, TodayPanel } from "../MyAreaExtras";

type Ward = {
  id: string; name: string; kind?: string; rank: number; score?: number; level?: string;
  water_km2: number; water_pct: number; crop_ha?: number; crop_total_ha?: number; roads_km?: number; facilities?: number;
  center?: [number, number]; area_km2?: number;
};
type Place = { kind: string; name: string; name_bn?: string | null; lon: number; lat: number };
type Day = { date: string; mm: number; prob?: number };

const IMPACT = "/data/chattogram/impact";
const CITY: [number, number] = [91.8317, 22.3569];
const FALLBACK_PLACES = "/data/chattogram/myarea/places.json";

const T = {
  en: {
    eyebrow: "My area · NISAR radar for everyone",
    title: "How is my area doing this monsoon?",
    lede: "Find your ward or union. See what the radar saw, where the nearest help is, what rain is coming and what it means for your field. Hear it read aloud or send it to your family.",
    locate: "Use my location", locating: "Finding you…", search: "Type your ward or union", sample: "Show the most affected ward",
    noLoc: "Location isn't available here. Pick your ward from the list instead.",
    outside: "You're outside the area we analysed; showing the closest ward.",
    loadingWards: "Ward data is still being prepared. Nearest help and rain still work.",
    rank: (r: number, n: number) => `Rank ${r} of ${n} most affected`,
    level: { high: "High signal", medium: "Moderate signal", low: "Low signal" } as Record<string, string>,
    water: "of the ward shows a water signal", waterKm: "km² water signal", roads: "km of road in the water signal", fac: "schools, clinics or shelters in it", crop: "ha cropland in the water signal",
    help: "Nearest help", hospital: "Hospital / clinic", shelter: "Shelter", away: "km away", directions: "Directions",
    rain: "Rain", past: "Last 7 days (NASA POWER, modelled)", next: "Next 3 days (Open-Meteo forecast)", mm: "mm",
    farmer: "For farmers", cropShare: (a: string, b: string) => `${a} of ${b} ha cropland is in the water signal`,
    adv: {
      heavy: "Heavy rain is coming. Wait before transplanting or harvesting; keep drains open.",
      moderate: "Some rain is coming. Keep field drains clear and protect seedbeds.",
      dry: "A dry window. Good days to harvest and dry the crop.",
      wet: "High field water was seen here. Drain the field and raise seedlings onto higher beds.",
      ok: "Little standing water was seen in this ward's fields.",
    },
    listen: "Listen", stop: "Stop", share: "Share", save: "Save card", whatsapp: "WhatsApp", facebook: "Facebook",
    honest: "“Water signal” is where NISAR radar became darker like open water between the June and October passes. It is an observation, not an official flood map. Check local warnings (BMD, union parishad) before acting.",
    say: (w: Ward, n: number) => `${w.name}. About ${fmtNum(w.water_pct, 0)} percent of the ward shows a water signal on NISAR radar. It ranks ${w.rank} of ${n}.`,
    sayRain: (mm: number) => `Expected rain in the next three days: ${fmtNum(mm, 0)} millimetres.`,
    sayHelp: (p: Place, km: number) => `The nearest hospital is ${p.name}, ${fmtNum(km, 1)} kilometres away.`,
    card: "Seen from space by NASA–ISRO NISAR",
  },
  bn: {
    eyebrow: "আমার এলাকা · সবার জন্য নাইসার রাডার",
    title: "এই বর্ষায় আমার এলাকা কেমন আছে?",
    lede: "আপনার ওয়ার্ড বা ইউনিয়ন খুঁজুন। রাডার কী দেখেছে, কাছের সাহায্য কোথায়, কেমন বৃষ্টি আসছে আর আপনার জমির জন্য তার মানে কী, দেখুন। শুনুন অথবা পরিবারকে পাঠিয়ে দিন।",
    locate: "আমার অবস্থান ব্যবহার করুন", locating: "খুঁজছি…", search: "ওয়ার্ড বা ইউনিয়নের নাম লিখুন", sample: "সবচেয়ে ক্ষতিগ্রস্ত ওয়ার্ড দেখুন",
    noLoc: "এখানে অবস্থান পাওয়া যাচ্ছে না। তালিকা থেকে আপনার ওয়ার্ড বেছে নিন।",
    outside: "আপনি বিশ্লেষিত এলাকার বাইরে; সবচেয়ে কাছের ওয়ার্ড দেখানো হচ্ছে।",
    loadingWards: "ওয়ার্ডের তথ্য এখনও তৈরি হচ্ছে। কাছের সাহায্য আর বৃষ্টির তথ্য দেখা যাবে।",
    rank: (r: number, n: number) => `সবচেয়ে ক্ষতিগ্রস্তদের মধ্যে ${fmtNum(n)}টির মধ্যে ${fmtNum(r)} নম্বর`,
    level: { high: "উচ্চ সংকেত", medium: "মাঝারি সংকেত", low: "কম সংকেত" } as Record<string, string>,
    water: "ওয়ার্ডে পানির সংকেত", waterKm: "বর্গ কিমি পানির সংকেত", roads: "কিমি সড়ক পানির সংকেতে", fac: "স্কুল, ক্লিনিক বা আশ্রয়কেন্দ্র এর মধ্যে", crop: "হেক্টর ফসলি জমি পানির সংকেতে",
    help: "কাছের সাহায্য", hospital: "হাসপাতাল / ক্লিনিক", shelter: "আশ্রয়কেন্দ্র", away: "কিমি দূরে", directions: "পথ দেখুন",
    rain: "বৃষ্টি", past: "গত ৭ দিন (নাসা পাওয়ার, মডেল)", next: "আগামী ৩ দিন (ওপেন-মিটিও পূর্বাভাস)", mm: "মিমি",
    farmer: "কৃষকের জন্য", cropShare: (a: string, b: string) => `${b} হেক্টর ফসলি জমির ${a} হেক্টর পানির সংকেতে`,
    adv: {
      heavy: "ভারী বৃষ্টি আসছে। চারা রোপণ বা ধান কাটা কিছুদিন পিছিয়ে দিন; নালা খোলা রাখুন।",
      moderate: "কিছু বৃষ্টি আসছে। জমির নালা পরিষ্কার রাখুন, বীজতলা ঢেকে রাখুন।",
      dry: "শুকনো সময়। ফসল কাটা আর শুকানোর ভালো সুযোগ।",
      wet: "এখানে জমিতে বেশি পানি দেখা গেছে। পানি বের করে দিন, চারা উঁচু বীজতলায় সরান।",
      ok: "এই ওয়ার্ডের জমিতে তেমন জমে থাকা পানি দেখা যায়নি।",
    },
    listen: "শুনুন", stop: "থামুন", share: "শেয়ার", save: "কার্ড সংরক্ষণ", whatsapp: "হোয়াটসঅ্যাপ", facebook: "ফেসবুক",
    honest: "“পানির সংকেত” মানে জুন আর অক্টোবরের মধ্যে নাইসার রাডারে যেখানে খোলা পানির মতো অন্ধকার দেখা গেছে। এটি পর্যবেক্ষণ, সরকারি বন্যা মানচিত্র নয়। পদক্ষেপ নেওয়ার আগে স্থানীয় সতর্কবার্তা (আবহাওয়া অধিদপ্তর, ইউনিয়ন পরিষদ) দেখুন।",
    say: (w: Ward, n: number) => `${w.name}। নাইসার রাডারে ওয়ার্ডের প্রায় ${fmtNum(w.water_pct, 0)} শতাংশে পানির সংকেত দেখা গেছে। ${fmtNum(n)}টির মধ্যে এর অবস্থান ${fmtNum(w.rank)}।`,
    sayRain: (mm: number) => `আগামী তিন দিনে প্রায় ${fmtNum(mm, 0)} মিলিমিটার বৃষ্টি হতে পারে।`,
    sayHelp: (p: Place, km: number) => `সবচেয়ে কাছের হাসপাতাল ${p.name_bn || p.name}, ${fmtNum(km, 1)} কিলোমিটার দূরে।`,
    card: "মহাকাশ থেকে দেখা · নাসা–ইসরো নাইসার",
  },
};

const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const inRing = (p: [number, number], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inGeom = (p: [number, number], g: GeoJSON.Geometry) =>
  g.type === "Polygon" ? inRing(p, g.coordinates[0]) : g.type === "MultiPolygon" ? g.coordinates.some((poly) => inRing(p, poly[0])) : false;
const centerOf = (w: Ward, f?: GeoJSON.Feature): [number, number] => {
  if (w.center) return w.center;
  const g = f?.geometry;
  const ring = g?.type === "Polygon" ? g.coordinates[0] : g?.type === "MultiPolygon" ? g.coordinates[0][0] : null;
  if (!ring) return [91.83, 22.33];
  return [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length];
};
const tone = (w: Ward) => (w.level ?? (w.water_pct >= 15 ? "high" : w.water_pct >= 5 ? "medium" : "low")).toLowerCase();

export function MyAreaView() {
  const lang = useLang();
  const s = T[lang];
  const { rain } = useCase();
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [shapes, setShapes] = useState<Map<string, GeoJSON.Feature>>(new Map());
  const [places, setPlaces] = useState<Place[]>([]);
  const [ward, setWard] = useState<Ward | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [forecast, setForecast] = useState<Day[] | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardBlob = useRef<Blob | null>(null);

  useEffect(() => {
    fetch(`${IMPACT}/impact.json`).then((r) => (r.ok ? r.json() : null)).then((d) => setWards(d?.wards ?? [])).catch(() => setWards([]));
    fetch(`${IMPACT}/wards.geojson`).then((r) => (r.ok ? r.json() : null)).then((d: GeoJSON.FeatureCollection | null) => {
      if (d) setShapes(new Map(d.features.map((f) => [String(f.properties?.id), f])));
    }).catch(() => {});
    fetch(`${IMPACT}/facilities.geojson`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: GeoJSON.FeatureCollection) => {
      setPlaces(d.features.filter((f) => f.geometry.type === "Point").map((f) => {
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const k = f.properties?.kind;
        return { kind: k === "health" ? "hospital" : k === "shelter" || k === "emergency" ? "shelter" : k, name: f.properties?.name, name_bn: f.properties?.name_bn, lon, lat };
      }).filter((p) => p.name));
    }).catch(() => fetch(FALLBACK_PLACES).then((r) => r.json()).then((d) => setPlaces(d.places)).catch(() => {}));
  }, []);

  const focus: [number, number] = me ?? (ward ? centerOf(ward, shapes.get(ward.id)) : CITY);

  // 3-day forecast for wherever we're looking (Open-Meteo: free, no key)
  useEffect(() => {
    if (!focus) return;
    const [lon, lat] = focus;
    let dead = false;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=precipitation_sum,precipitation_probability_max&timezone=Asia%2FDhaka&forecast_days=3`)
      .then((r) => r.json())
      .then((d) => !dead && setForecast(d.daily.time.map((t: string, i: number) => ({ date: t, mm: d.daily.precipitation_sum[i] ?? 0, prob: d.daily.precipitation_probability_max?.[i] }))))
      .catch(() => !dead && setForecast(null));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.[0].toFixed(2), focus?.[1].toFixed(2)]);

  const pickAt = (p: [number, number]) => {
    if (!wards?.length) return;
    const hit = wards.find((w) => { const f = shapes.get(w.id); return f && inGeom(p, f.geometry); });
    if (hit) { setWard(hit); setNote(""); return; }
    const near = [...wards].sort((a, b) => km(p, centerOf(a, shapes.get(a.id))) - km(p, centerOf(b, shapes.get(b.id))))[0];
    setWard(near); setNote(s.outside);
  };
  const locate = () => {
    if (!navigator.geolocation) return setNote(s.noLoc);
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]; setMe(p); pickAt(p); setBusy(false); },
      () => { setNote(s.noLoc); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const choose = (w: Ward) => { setWard(w); setMe(null); setNote(""); setQuery(w.name); };

  const ranked = useMemo(() => [...(wards ?? [])].sort((a, b) => a.rank - b.rank), [wards]);
  const matches = query && !ranked.some((w) => w.name === query) ? ranked.filter((w) => w.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [];

  const nearest = (kind: string) =>
    focus ? places.filter((p) => p.kind === kind).map((p) => ({ p, d: km(focus, [p.lon, p.lat]) })).sort((a, b) => a.d - b.d)[0] ?? null : null;
  const hosp = nearest("hospital");
  const shel = nearest("shelter");

  const past = rain?.days.slice(-7) ?? [];
  const pastSum = past.reduce((a, d) => a + (d.mm ?? 0), 0);
  const nextSum = forecast?.reduce((a, d) => a + (d.mm ?? 0), 0) ?? 0;
  const maxDay = Math.max(1, ...past.map((d) => d.mm ?? 0), ...(forecast ?? []).map((d) => d.mm));
  const rainAdvice = forecast ? (nextSum >= 50 || forecast.some((d) => d.mm >= 30) ? "heavy" : nextSum >= 10 ? "moderate" : "dry") : null;
  const fieldAdvice = ward ? (ward.water_pct >= 10 ? "wet" : "ok") : null;

  const script = () => [ward && s.say(ward, ranked.length), forecast && s.sayRain(nextSum), hosp && s.sayHelp(hosp.p, hosp.d), rainAdvice && s.adv[rainAdvice], fieldAdvice === "wet" && s.adv.wet].filter(Boolean).join(" ");
  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(script());
    u.lang = lang === "bn" ? "bn-BD" : "en-US";
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "bn" ? "bn" : "en"));
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel(); synth.speak(u); setSpeaking(true);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // the share card: drawn on a canvas so it works offline and needs no server
  useEffect(() => {
    if (!ward) return;
    let url: string | null = null;
    let dead = false;
    document.fonts.ready.then(() => {
      if (dead) return;
      const c = document.createElement("canvas");
      c.width = 1080; c.height = 1350;
      const g = c.getContext("2d")!;
      const font = lang === "bn" ? "'Noto Sans Bengali', var(--font-bn-sans), sans-serif" : "'IBM Plex Sans', system-ui, sans-serif";
      const bg = g.createLinearGradient(0, 0, 1080, 1350);
      bg.addColorStop(0, "#071827"); bg.addColorStop(1, "#0d3b4f");
      g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
      // radar rings
      g.strokeStyle = "rgba(94, 234, 212, .10)"; g.lineWidth = 2;
      for (let r = 120; r < 1100; r += 110) { g.beginPath(); g.arc(900, 260, r, 0, Math.PI * 2); g.stroke(); }
      const t = tone(ward);
      const accent = t === "high" ? "#fb7185" : t === "medium" ? "#fbbf24" : "#5eead4";
      g.fillStyle = "#5eead4"; g.font = `600 34px ${font}`; g.fillText(s.card, 80, 130);
      g.fillStyle = "#e6f1f7"; g.font = `600 84px ${font}`; g.fillText(ward.name, 80, 290, 920);
      g.fillStyle = accent; g.font = `700 260px ${font}`; g.fillText(`${fmtNum(ward.water_pct, 0)}%`, 70, 590);
      g.fillStyle = "#b6c8d4"; g.font = `500 44px ${font}`; g.fillText(s.water, 84, 670, 920);
      const rows: [string, string][] = [
        [fmtNum(ward.water_km2, 2), s.waterKm],
        ...(ward.roads_km != null ? [[fmtNum(ward.roads_km, 1), s.roads] as [string, string]] : []),
        ...(ward.facilities != null ? [[fmtNum(ward.facilities), s.fac] as [string, string]] : []),
        ...(forecast ? [[`${fmtNum(nextSum, 0)} ${s.mm}`, s.next] as [string, string]] : []),
      ];
      rows.forEach(([v, l], i) => {
        const y = 800 + i * 110;
        g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(80, y - 70, 920, 96);
        g.fillStyle = "#e6f1f7"; g.font = `700 52px ${font}`; g.fillText(v, 110, y);
        g.fillStyle = "#9fb3c2"; g.font = `500 34px ${font}`; g.fillText(l, 380, y - 4, 600);
      });
      g.fillStyle = accent; g.fillRect(80, 1240, 120, 8);
      g.fillStyle = "#9fb3c2"; g.font = `500 30px ${font}`; g.fillText(`${s.rank(ward.rank, ranked.length)} · CryoCore Horizon`, 80, 1295, 920);
      c.toBlob((b) => {
        if (!b || dead) return;
        cardBlob.current = b;
        url = URL.createObjectURL(b);
        setCardUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      }, "image/png");
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ward, lang, forecast]);
  useEffect(() => () => { if (cardUrl) URL.revokeObjectURL(cardUrl); }, [cardUrl]);

  const shareText = ward ? `${s.say(ward, ranked.length)} ${typeof location !== "undefined" ? location.href : ""}` : "";
  const share = async () => {
    const b = cardBlob.current;
    const file = b ? new File([b], "my-area.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: shareText });
      if (navigator.share) return await navigator.share({ text: shareText, url: location.href });
    } catch (e) { if ((e as Error).name === "AbortError") return; }
    if (cardUrl) Object.assign(document.createElement("a"), { href: cardUrl, download: "my-area.png" }).click();
  };

  const shape = ward ? shapes.get(ward.id) ?? null : null;
  const view = focus ? { lon: focus[0], lat: focus[1], zoom: 12.4 } : { lon: 91.845, lat: 22.31, zoom: 10.6 };
  const t = ward ? tone(ward) : "low";

  return (
    <div className="ma" data-tone={t}>
      <section className="ma-hero">
        <div className="ma-hero-copy">
          <p className="ma-eyebrow"><Sparkles size={14} aria-hidden="true" /> {s.eyebrow}</p>
          <h1>{s.title}</h1>
          <p className="ma-lede">{s.lede}</p>
          <div className="ma-find">
            <button type="button" className="ma-btn is-primary" onClick={locate} disabled={busy}>
              <LocateFixed size={18} aria-hidden="true" /> {busy ? s.locating : s.locate}
            </button>
            <div className="ma-search">
              <MapPin size={16} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={s.search} aria-label={s.search} list="ma-wards" />
              <datalist id="ma-wards">{ranked.map((w) => <option key={w.id} value={w.name} />)}</datalist>
              {matches.length > 0 && (
                <ul className="ma-suggest" role="listbox">
                  {matches.map((w) => (
                    <li key={w.id}><button type="button" onClick={() => choose(w)}>{w.name}<small>{fmtNum(w.water_pct, 0)}%</small></button></li>
                  ))}
                </ul>
              )}
            </div>
            {ranked[0] && <button type="button" className="ma-link" onClick={() => choose(ranked[0])}>{s.sample} →</button>}
          </div>
          {note && <p className="ma-note">{note}</p>}
          {wards && !wards.length && <p className="ma-note">{s.loadingWards}</p>}
        </div>
        <div className="ma-hero-map">
          <CaseMap key={ward?.id ?? (me ? "me" : "all")} label={ward?.name ?? s.title} view={view} image={null} area={shape} areaName={ward?.name} controls={false} />
          <div className="ma-pulse" aria-hidden="true" />
        </div>
      </section>

      <TodayPanel at={focus} place={ward?.name ?? (me ? null : "Chattogram")} />

      {ward && (
        <section className="ma-status" aria-live="polite">
          <div className="ma-gauge" style={{ ["--p" as string]: Math.min(100, ward.water_pct) }}>
            <div><strong>{fmtNum(ward.water_pct, 0)}<small>%</small></strong><span>{s.water}</span></div>
          </div>
          <div className="ma-status-copy">
            <span className="ma-chip">{s.level[t] ?? t}</span>
            <h2>{ward.name}</h2>
            <p className="ma-rank">{s.rank(ward.rank, ranked.length)}</p>
            <dl className="ma-facts">
              <div><dt><Droplets size={16} /></dt><dd><b>{fmtNum(ward.water_km2, 2)}</b> {s.waterKm}</dd></div>
              {ward.roads_km != null && <div><dt><Route size={16} /></dt><dd><b>{fmtNum(ward.roads_km, 1)}</b> {s.roads}</dd></div>}
              {ward.facilities != null && <div><dt><Shield size={16} /></dt><dd><b>{fmtNum(ward.facilities)}</b> {s.fac}</dd></div>}
            </dl>
            <div className="ma-actions">
              <button type="button" className="ma-btn is-primary" onClick={speak}>{speaking ? <Pause size={18} /> : <Volume2 size={18} />} {speaking ? s.stop : s.listen}</button>
              <button type="button" className="ma-btn" onClick={share}><Share2 size={18} /> {s.share}</button>
              <a className="ma-btn is-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">{s.whatsapp}</a>
              <a className="ma-btn is-fb" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof location !== "undefined" ? location.href : "")}`} target="_blank" rel="noreferrer">{s.facebook}</a>
              {cardUrl && <a className="ma-btn" href={cardUrl} download="my-area.png"><Download size={18} /> {s.save}</a>}
            </div>
          </div>
          {cardUrl && <img className="ma-card" src={cardUrl} alt="" />}
        </section>
      )}

      {focus && (
        <div className="ma-grid">
          <section className="ma-panel">
            <h3><Hospital size={18} /> {s.help}</h3>
            {[hosp && { ...hosp, label: s.hospital, Icon: Hospital }, shel && { ...shel, label: s.shelter, Icon: Shield }].filter(Boolean).map((h) => {
              const { p, d, label, Icon } = h as { p: Place; d: number; label: string; Icon: typeof Hospital };
              return (
                <div className="ma-help" key={label}>
                  <span className="ma-help-ic"><Icon size={20} /></span>
                  <div><small>{label}</small><strong>{lang === "bn" ? p.name_bn || p.name : p.name}</strong><span>{fmtNum(d, 1)} {s.away}</span></div>
                  <a className="ma-btn is-sm" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noreferrer"><Navigation size={14} /> {s.directions}</a>
                </div>
              );
            })}
          </section>

          <section className="ma-panel">
            <h3><CloudRain size={18} /> {s.rain}</h3>
            <div className="ma-bars" role="img" aria-label={`${s.past}: ${fmtNum(pastSum, 0)} ${s.mm}. ${s.next}: ${fmtNum(nextSum, 0)} ${s.mm}`}>
              {past.map((d) => <i key={d.date} style={{ ["--h" as string]: (d.mm ?? 0) / maxDay }} title={`${fmtDate(d.date)} · ${fmtNum(d.mm, 1)} ${s.mm}`} />)}
              <b aria-hidden="true" />
              {(forecast ?? []).map((d) => <i key={d.date} className="is-next" style={{ ["--h" as string]: (d.mm ?? 0) / maxDay }} title={`${fmtDate(d.date)} · ${fmtNum(d.mm, 1)} ${s.mm}`} />)}
            </div>
            <div className="ma-rain-sums">
              <div><small>{s.past}</small><strong>{fmtNum(pastSum, 0)} <em>{s.mm}</em></strong></div>
              <div className="is-next"><small>{s.next}</small><strong>{forecast ? fmtNum(nextSum, 0) : "–"} <em>{s.mm}</em></strong></div>
            </div>
          </section>

          <section className="ma-panel ma-farm">
            <h3><Sprout size={18} /> {s.farmer}</h3>
            {ward?.crop_ha != null && ward.crop_total_ha ? (
              <>
                <div className="ma-meter"><span style={{ width: `${Math.min(100, (ward.crop_ha / ward.crop_total_ha) * 100)}%` }} /></div>
                <p className="ma-sub">{s.cropShare(fmtNum(ward.crop_ha, 1), fmtNum(ward.crop_total_ha, 1))}</p>
              </>
            ) : null}
            {rainAdvice && <p className={`ma-advice is-${rainAdvice}`}>{s.adv[rainAdvice]}</p>}
            {fieldAdvice && <p className={`ma-advice is-${fieldAdvice}`}>{s.adv[fieldAdvice]}</p>}
          </section>
        </div>
      )}

      <Preparedness />

      <p className="ma-honest">{s.honest}</p>
    </div>
  );
}
