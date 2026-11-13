"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Cloud, MoveHorizontal, Play, Radar, Waves } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";
import { useCase } from "../CaseProvider";

// wide frame around the processed radar window, so the clouds over the whole coast are visible
const WIDE = { w: 91.55, s: 22.06, e: 92.14, n: 22.56 };
const BOX = { w: 91.7881341, s: 22.2386369, e: 91.9017111, n: 22.3813361 }; // curated layer corners
const PASSES = [
  { radar: "/data/chattogram/case/curated/before_db.png", nisar: "2026-06-18", optical: "2026-06-19" },
  { radar: "/data/chattogram/case/curated/after_db.png", nisar: "2026-10-16", optical: "2026-10-17" },
];
// VIIRS first: its wide swath leaves no gaps at this latitude (MODIS can show a black no-data strip)
const LAYERS = [
  { id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", label: "VIIRS NOAA-20" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS Suomi NPP" },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "MODIS Terra" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "MODIS Aqua" },
];
// places people know, approximate centres; shown only on the radar side
const PINS = [
  { en: "Chattogram Port", bn: "চট্টগ্রাম বন্দর", lonLat: [91.8, 22.305] },
  { en: "Shah Amanat Airport", bn: "শাহ আমানত বিমানবন্দর", lonLat: [91.8133, 22.2496] },
  { en: "Shah Amanat Bridge", bn: "শাহ আমানত সেতু", lonLat: [91.846, 22.33] },
];
const gibs = (layer: string, date: string) =>
  `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:4326&BBOX=${WIDE.s},${WIDE.w},${WIDE.n},${WIDE.e}&WIDTH=1100&HEIGHT=1000&FORMAT=image/jpeg&TIME=${date}`;

const T = {
  en: {
    title: "Through the clouds", lede: "In the monsoon, satellite cameras mostly photograph the tops of clouds. NISAR sends its own microwaves, which pass through cloud, rain and darkness. Drag the line to see both.",
    optical: "Camera", radar: "NISAR radar", sensor: "Camera satellite", june: "Monsoon", oct: "After the rains",
    hid: (p: string) => `Clouds hid ${p}% of the radar window from the camera`, saw: "NISAR saw all of it, at night, through the rain.", clear: (p: string) => `The camera could see ${p}% of the radar window this time.`,
    measuring: "Measuring the cloud…", sweep: "Play sweep", drag: "Drag to compare",
    how: [
      { h: "A camera needs sunlight", p: "It sees what your eyes would. Under monsoon cloud, that is cloud." },
      { h: "Radar brings its own light", p: "NISAR's 24 cm microwaves go through cloud and rain, day or night, and bounce back off the ground." },
      { h: "So floods are seen while they happen", p: "Smooth water reflects the signal away and looks dark. That is why rivers and flooded fields stand out." },
    ],
    cap: (n: string, o: string) => `NISAR L-band radar, ${n} (night pass); NASA true-colour imagery, ${o} (next morning). The outlined window is the processed radar area over the Karnaphuli estuary and Chattogram port. Place pins are approximate.`,
    src: "Optical: NASA GIBS / Worldview. Radar: NASA–ISRO NISAR GCOV via ASF DAAC, calibrated HH backscatter in dB. Cloud share: pixels in the camera image that are bright and colourless.",
  },
  bn: {
    title: "মেঘ ভেদ করে", lede: "বর্ষায় উপগ্রহের ক্যামেরা বেশিরভাগ সময় মেঘের ওপরটাই তোলে। নাইসার নিজের মাইক্রোওয়েভ পাঠায়, যা মেঘ, বৃষ্টি আর অন্ধকার ভেদ করে যায়। দুটোই দেখতে রেখাটি টানুন।",
    optical: "ক্যামেরা", radar: "নাইসার রাডার", sensor: "ক্যামেরা উপগ্রহ", june: "বর্ষা", oct: "বৃষ্টির পরে",
    hid: (p: string) => `রাডার অংশের ${p}% মেঘে ঢাকা ছিল, ক্যামেরা দেখতে পায়নি`, saw: "নাইসার পুরোটাই দেখেছে, রাতে, বৃষ্টির মধ্যেও।", clear: (p: string) => `এবার ক্যামেরা রাডার অংশের ${p}% দেখতে পেয়েছে।`,
    measuring: "মেঘ মাপা হচ্ছে…", sweep: "স্বয়ংক্রিয় তুলনা", drag: "তুলনা করতে টানুন",
    how: [
      { h: "ক্যামেরার দরকার সূর্যের আলো", p: "আপনার চোখ যা দেখত, ক্যামেরাও তাই দেখে। বর্ষার মেঘের নিচে সেটা শুধু মেঘ।" },
      { h: "রাডার নিজের আলো আনে", p: "নাইসারের ২৪ সেমি মাইক্রোওয়েভ মেঘ ও বৃষ্টি ভেদ করে দিনে-রাতে মাটিতে পৌঁছে ফিরে আসে।" },
      { h: "তাই বন্যা চলাকালীনই দেখা যায়", p: "মসৃণ পানি সংকেত অন্যদিকে ফিরিয়ে দেয়, তাই অন্ধকার দেখায়। এ কারণেই নদী আর ডোবা জমি আলাদা করে চোখে পড়ে।" },
    ],
    cap: (n: string, o: string) => `নাইসার এল-ব্যান্ড রাডার, ${n} (রাতের পর্যবেক্ষণ); নাসার প্রাকৃতিক রঙের ছবি, ${o} (পরদিন সকাল)। চিহ্নিত অংশটি কর্ণফুলী মোহনা ও চট্টগ্রাম বন্দরের প্রক্রিয়াকৃত রাডার এলাকা। স্থানের চিহ্ন আনুমানিক।`,
    src: "অপটিক্যাল: নাসা জিআইবিএস / ওয়ার্ল্ডভিউ। রাডার: নাসা–ইসরো নাইসার জিসিওভি (এএসএফ ড্যাক), ক্যালিব্রেটেড এইচএইচ ব্যাকস্ক্যাটার (ডিবি)। মেঘের ভাগ: ক্যামেরার ছবির উজ্জ্বল ও রংহীন পিক্সেল।",
  },
};

const pct = (v: number, a: number, b: number) => ((v - a) / (b - a)) * 100;
const box = { left: pct(BOX.w, WIDE.w, WIDE.e), right: 100 - pct(BOX.e, WIDE.w, WIDE.e), top: 100 - pct(BOX.n, WIDE.s, WIDE.n), bottom: pct(BOX.s, WIDE.s, WIDE.n) };

/** Share of the radar window that is cloud in the camera image: bright, nearly colourless pixels. */
function cloudShare(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const x0 = Math.round((box.left / 100) * c.width), y0 = Math.round((box.top / 100) * c.height);
  const w = Math.round(((100 - box.left - box.right) / 100) * c.width), h = Math.round(((100 - box.top - box.bottom) / 100) * c.height);
  const d = g.getImageData(x0, y0, w, h).data;
  let cloud = 0, valid = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], max = Math.max(r, gg, b), min = Math.min(r, gg, b);
    if (max < 8) continue; // no data
    valid++;
    if (max > 150 && max - min < 40) cloud++;
  }
  return valid ? (cloud / valid) * 100 : null;
}

export function CloudsView() {
  const lang = useLang();
  const s = T[lang];
  useCase(); // inside the case shell (theme, language, source notice)
  const [pass, setPass] = useState(0);
  const [layer, setLayer] = useState(LAYERS[0].id);
  const [x, setX] = useState(50);
  const [cloud, setCloud] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const anim = useRef(0);
  const p = PASSES[pass];
  const src = gibs(layer, p.optical);

  useEffect(() => {
    setCloud(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { try { setCloud(cloudShare(img)); } catch { /* tainted canvas: leave unmeasured */ } };
    img.src = src;
  }, [src]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const sweep = () => {
    cancelAnimationFrame(anim.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setX(50);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 3600);
      // 50 → 100 → 0 → 50, eased
      setX(50 + 50 * Math.sin(k * Math.PI * 2) * (1 - k * 0.15));
      if (k < 1) anim.current = requestAnimationFrame(step); else setX(50);
    };
    anim.current = requestAnimationFrame(step);
  };
  const drag = (e: React.PointerEvent) => {
    if (e.type === "pointerdown") { cancelAnimationFrame(anim.current); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    else if (!(e.buttons & 1)) return;
    const r = frame.current!.getBoundingClientRect();
    setX(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };
  const at = (lon: number, lat: number) => ({ left: `${pct(lon, WIDE.w, WIDE.e)}%`, top: `${100 - pct(lat, WIDE.s, WIDE.n)}%` });

  return (
    <div className="cl">
      <header className="cl-head">
        <h1>{s.title}</h1>
        <p className="ma-lede">{s.lede}</p>
      </header>

      <div className="cl-stage">
        <div className="cl-verdict" aria-live="polite">
          <Cloud size={28} aria-hidden="true" />
          {cloud == null ? <p>{s.measuring}</p> : cloud >= 30 ? (
            <>
              <strong>{fmtNum(cloud, 0)}<small>%</small></strong>
              <p>{s.hid(fmtNum(cloud, 0))}. <b>{s.saw}</b></p>
            </>
          ) : (
            <>
              <strong className="is-clear">{fmtNum(100 - cloud, 0)}<small>%</small></strong>
              <p>{s.clear(fmtNum(100 - cloud, 0))} <b>{s.saw}</b></p>
            </>
          )}
        </div>
        <div className="cl-controls">
          <div className="cl-seg" role="group">
            {PASSES.map((q, i) => (
              <button key={q.nisar} type="button" aria-pressed={pass === i} onClick={() => setPass(i)}>
                {i === 0 ? s.june : s.oct}<small>{fmtDate(q.nisar)}</small>
              </button>
            ))}
          </div>
          <label className="cl-select">
            <span>{s.sensor}</span>
            <select value={layer} onChange={(e) => setLayer(e.target.value)}>{LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          </label>
          <button type="button" className="ma-btn" onClick={sweep}><Play size={16} aria-hidden="true" /> {s.sweep}</button>
        </div>
      </div>

      <div
        className="cl-frame"
        ref={frame}
        onPointerDown={drag}
        onPointerMove={drag}
        role="slider"
        tabIndex={0}
        aria-label={s.drag}
        aria-valuenow={Math.round(x)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setX((v) => Math.max(0, v - 5));
          if (e.key === "ArrowRight") setX((v) => Math.min(100, v + 5));
        }}
      >
        <img className="cl-optical" src={src} alt={s.optical} draggable={false} />
        <div className="cl-radar" style={{ clipPath: `inset(0 0 0 ${x}%)` }}>
          <div className="cl-dim" />
          <img src={p.radar} alt={s.radar} draggable={false} style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${100 - box.left - box.right}%`, height: `${100 - box.top - box.bottom}%` }} />
          {PINS.map((pin) => (
            <span key={pin.en} className="cl-pin" style={at(pin.lonLat[0], pin.lonLat[1])}><i />{pin[lang]}</span>
          ))}
        </div>
        <div className="cl-box" style={{ left: `${box.left}%`, right: `${box.right}%`, top: `${box.top}%`, bottom: `${box.bottom}%` }} />
        <span className="cl-tag is-left"><Camera size={14} /> {s.optical} · {fmtDate(p.optical)}</span>
        <span className="cl-tag is-right"><Radar size={14} /> {s.radar} · {fmtDate(p.nisar)}</span>
        <div className="cl-handle" style={{ left: `${x}%` }}><span><MoveHorizontal size={18} /></span></div>
      </div>
      <p className="cl-cap">{s.cap(fmtDate(p.nisar), fmtDate(p.optical))}</p>

      <ol className="cl-how">
        {s.how.map((h, i) => {
          const Icon = [Camera, Radar, Waves][i];
          return (
            <li key={h.h}>
              <Icon size={22} aria-hidden="true" />
              <h3>{h.h}</h3>
              <p>{h.p}</p>
            </li>
          );
        })}
      </ol>
      <p className="ma-honest">{s.src}</p>
    </div>
  );
}
