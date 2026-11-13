"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "mapbox-gl";
import { Download, Printer, Sprout, Route, Building2, Waves, Check } from "lucide-react";
import { PageHead } from "@/components/dashboard/ui";
import { MapUnavailable } from "@/components/maps/MapUnavailable";
import { loadMapbox, MAPBOX_CONFIGURED, MAPBOX_TOKEN, mapStyle, followMapTheme, cameraDuration } from "@/lib/mapbox";
import { fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";

const DIR = "/data/chattogram/impact/";
type Level = "severe" | "high" | "moderate" | "low";
type Ward = {
  id: string; name: string; kind: "ward" | "union"; rank: number; score: number; level: Level;
  area_km2: number; land_km2: number; water_km2: number; water_pct: number; crop_ha: number; crop_total_ha: number;
  built_ha: number; roads_km: number; major_roads_km: number; facilities: number; facility_kinds: Record<string, number>; center: [number, number];
};
type Impact = {
  before: string; after: string; bounds: [number, number, number, number]; overlay: string; method: string; score: string;
  summary: { water_km2: number; crop_ha: number; roads_km: number; major_roads_km: number; facilities: number; facilities_total: number; areas: number; areas_severe: number };
  wards: Ward[];
};

const LEVEL_COLOR: Record<Level, string> = { severe: "#e5484d", high: "#f08c2e", moderate: "#d9b84a", low: "#5d7488" };

const TXT = {
  en: {
    crumb: "Impact and priorities",
    csv: "Download ranking (CSV)", print: "Print brief",
    lede: (s: Impact["summary"]) => (
      <>
        In June {fmtNum(s.water_km2, 1)} km² of land lay under water that was gone by October. Most of it was farmland south of the Karnaphuli:{" "}
        {fmtNum(s.crop_ha, 0)} hectares of cropland across {s.areas_severe} areas that need attention first.
      </>
    ),
    sub: "NISAR L-band radar, 18 June against 16 October 2026, ranked by union and city ward so relief, drainage and crop-loss teams know where to go.",
    facts: { water: "land under flood signal", crop: "cropland affected", roads: "road under flood signal", fac: "facilities within 30 m" },
    all: "All areas", union: "Rural unions", ward: "City wards",
    listLabel: "Areas ranked by priority",
    level: { severe: "Act first", high: "High", moderate: "Watch", low: "Low" } as Record<Level, string>,
    ofLand: "of its land", crop: "cropland", roads: "road", fac: "facilities",
    actions: "What to do here",
    act: {
      crop: (ha: number, tot: number) => `Send the agriculture officer for a crop-loss survey: ${fmtNum(ha, 0)} of ${fmtNum(tot, 0)} ha of cropland sat under water. Prioritise seed and fertiliser support.`,
      road: (km: number, major: number) => `Clear drains and check access on ${fmtNum(km, 1)} km of road${major > 0.05 ? `, ${fmtNum(major, 1)} km of it main road` : ""}.`,
      fac: (n: number) => `${n} school, clinic or shelter${n > 1 ? "s" : ""} sit within 30 m of flooded ground: confirm they stay reachable.`,
      pump: "Pre-position pumps and relief stock here before the next monsoon.",
      watch: "Little flooding detected. Keep it on the watch list.",
    },
    map: { flood: "Flood signal (June, gone by October)", roads: "Roads under flood signal", fac: "Facilities", river: "Permanent river", areas: "Areas by priority" },
    pick: "Pick an area on the map or in the list.",
    method: "How this is measured",
    caveat: "This is a radar signal of wet or flooded ground, not a measured flood depth. Tide, wind on water and crop growth also change the signal; check on the ground before committing money.",
    rank: "Rank", score: "Priority score", one: { ward: "City ward", union: "Rural union" },
  },
  bn: {
    crumb: "ক্ষতি ও অগ্রাধিকার",
    csv: "তালিকা ডাউনলোড (CSV)", print: "সারসংক্ষেপ প্রিন্ট",
    lede: (s: Impact["summary"]) => (
      <>
        জুনে {fmtNum(s.water_km2, 1)} বর্গকিমি জমি পানির নিচে ছিল, যা অক্টোবরে নেমে গেছে। এর বেশিরভাগ কর্ণফুলীর দক্ষিণের ফসলি জমি:{" "}
        {fmtNum(s.crop_ha, 0)} হেক্টর ফসলি জমি, {s.areas_severe}টি এলাকায় আগে ব্যবস্থা নেওয়া দরকার।
      </>
    ),
    sub: "NISAR এল-ব্যান্ড রাডার, ১৮ জুন বনাম ১৬ অক্টোবর ২০২৬। ইউনিয়ন ও সিটি ওয়ার্ড ধরে সাজানো, যাতে ত্রাণ, নিষ্কাশন ও ফসল-ক্ষতি দল জানে কোথায় যেতে হবে।",
    facts: { water: "জমি বন্যা-সংকেতে", crop: "ফসলি জমি ক্ষতিগ্রস্ত", roads: "রাস্তা বন্যা-সংকেতে", fac: "স্থাপনা ৩০ মিটারের মধ্যে" },
    all: "সব এলাকা", union: "গ্রামীণ ইউনিয়ন", ward: "সিটি ওয়ার্ড",
    listLabel: "অগ্রাধিকার অনুযায়ী এলাকা",
    level: { severe: "আগে ব্যবস্থা", high: "উচ্চ", moderate: "নজরে রাখুন", low: "কম" } as Record<Level, string>,
    ofLand: "জমির", crop: "ফসলি জমি", roads: "রাস্তা", fac: "স্থাপনা",
    actions: "এখানে কী করবেন",
    act: {
      crop: (ha: number, tot: number) => `ফসল-ক্ষতি জরিপে কৃষি কর্মকর্তা পাঠান: ${fmtNum(tot, 0)} হেক্টরের মধ্যে ${fmtNum(ha, 0)} হেক্টর ফসলি জমি পানির নিচে ছিল। বীজ ও সার সহায়তায় অগ্রাধিকার দিন।`,
      road: (km: number, major: number) => `${fmtNum(km, 1)} কিমি রাস্তায় নালা পরিষ্কার ও চলাচল যাচাই করুন${major > 0.05 ? `, এর ${fmtNum(major, 1)} কিমি প্রধান সড়ক` : ""}।`,
      fac: (n: number) => `${n}টি স্কুল, ক্লিনিক বা আশ্রয়কেন্দ্র প্লাবিত জমির ৩০ মিটারের মধ্যে: পৌঁছানো যায় কি না নিশ্চিত করুন।`,
      pump: "পরের বর্ষার আগে এখানে পাম্প ও ত্রাণ মজুত রাখুন।",
      watch: "সামান্য প্লাবন ধরা পড়েছে। নজরে রাখুন।",
    },
    map: { flood: "বন্যা-সংকেত (জুনে, অক্টোবরে নেই)", roads: "বন্যা-সংকেতে রাস্তা", fac: "স্থাপনা", river: "স্থায়ী নদী", areas: "অগ্রাধিকার অনুযায়ী এলাকা" },
    pick: "মানচিত্রে বা তালিকায় একটি এলাকা বেছে নিন।",
    method: "কীভাবে মাপা হয়েছে",
    caveat: "এটি ভেজা বা প্লাবিত জমির রাডার সংকেত, পানির গভীরতা নয়। জোয়ার, পানিতে বাতাস ও ফসলের বৃদ্ধিও সংকেত বদলায়; অর্থ বরাদ্দের আগে মাঠে যাচাই করুন।",
    rank: "ক্রম", score: "অগ্রাধিকার স্কোর", one: { ward: "সিটি ওয়ার্ড", union: "গ্রামীণ ইউনিয়ন" },
  },
};

function actionsFor(w: Ward, t: (typeof TXT)["en"]) {
  const a: string[] = [];
  if (w.crop_ha >= 20) a.push(t.act.crop(w.crop_ha, w.crop_total_ha));
  if (w.roads_km >= 0.3) a.push(t.act.road(w.roads_km, w.major_roads_km));
  if (w.facilities > 0) a.push(t.act.fac(w.facilities));
  if (w.water_pct >= 8) a.push(t.act.pump);
  if (!a.length) a.push(t.act.watch);
  return a;
}

function downloadCsv(wards: Ward[]) {
  const cols = ["rank", "name", "kind", "level", "score", "water_km2", "water_pct", "crop_ha", "crop_total_ha", "roads_km", "major_roads_km", "facilities", "land_km2"] as const;
  const csv = [cols.join(","), ...wards.map((w) => cols.map((c) => JSON.stringify(w[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "chattogram-flood-priorities.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ImpactView() {
  const lang = useLang();
  const t = TXT[lang === "bn" ? "bn" : "en"];
  const [data, setData] = useState<Impact | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "union" | "ward">("all");
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${DIR}impact.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: Impact) => { setData(d); setSel(d.wards[0]?.id ?? null); }).catch(() => setFailed(true));
  }, []);

  const list = useMemo(() => (data ? data.wards.filter((w) => filter === "all" || w.kind === filter) : []), [data, filter]);
  const ward = data?.wards.find((w) => w.id === sel) ?? null;
  const maxScore = data?.wards[0]?.score || 1;

  if (failed) return <p className="i-empty">The impact data is missing. Run backend/scripts/build_impact.py to create it.</p>;
  if (!data) return <div className="i-loading" aria-busy="true" />;
  const s = data.summary;

  return (
    <div className="i-page">
      <PageHead
        crumbs={[t.crumb]}
        actions={
          <>
            <button type="button" className="d-btn" onClick={() => downloadCsv(data.wards)}><Download size={16} aria-hidden="true" />{t.csv}</button>
            <button type="button" className="d-btn is-primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />{t.print}</button>
          </>
        }
      />

      <section className="i-hero">
        <div>
          <h1>{t.lede(s)}</h1>
          <p>{t.sub}</p>
        </div>
        <dl className="i-facts">
          <div><dt>{t.facts.water}</dt><dd>{fmtNum(s.water_km2, 1)}<small>km²</small></dd></div>
          <div><dt>{t.facts.crop}</dt><dd>{fmtNum(s.crop_ha, 0)}<small>ha</small></dd></div>
          <div><dt>{t.facts.roads}</dt><dd>{fmtNum(s.roads_km, 1)}<small>km</small></dd></div>
          <div><dt>{t.facts.fac}</dt><dd>{s.facilities}<small>/ {s.facilities_total}</small></dd></div>
        </dl>
      </section>

      <section className="i-work">
        <div className="i-mapwrap">
          <ImpactMap data={data} selected={sel} onSelect={setSel} label={t.map.areas} />
          <ul className="i-legend" aria-label="Map key">
            <li><i className="sw-flood" />{t.map.flood}</li>
            <li><i className="sw-road" />{t.map.roads}</li>
            <li><i className="sw-fac" />{t.map.fac}</li>
            <li className="i-legend-levels">
              {(["severe", "high", "moderate", "low"] as Level[]).map((l) => (
                <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{t.level[l]}</span>
              ))}
            </li>
          </ul>
        </div>

        <aside className="i-rank" aria-label={t.listLabel}>
          <div className="i-tabs" role="tablist">
            {(["all", "union", "ward"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>{t[f]}</button>
            ))}
          </div>
          <ol>
            {list.map((w) => (
              <li key={w.id}>
                <button type="button" aria-pressed={w.id === sel} onClick={() => setSel(w.id)} style={{ ["--lvl" as string]: LEVEL_COLOR[w.level] }}>
                  <span className="i-r-n">{w.rank}</span>
                  <span className="i-r-name">{w.name}</span>
                  <span className="i-r-val">{fmtNum(w.water_pct, 1)}%</span>
                  <span className="i-r-bar"><span style={{ width: `${(100 * w.score) / maxScore}%` }} /></span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {ward ? (
        <section className="i-dossier" aria-live="polite" style={{ ["--lvl" as string]: LEVEL_COLOR[ward.level] }}>
          <header>
            <span className="i-d-rank">{ward.rank}</span>
            <div>
              <h2>{ward.name}</h2>
              <p>
                <span className="i-chip">{t.level[ward.level]}</span>
                {t.score} {fmtNum(ward.score, 0)} / 100 · {ward.kind === "ward" ? t.one.ward : t.one.union}
              </p>
            </div>
          </header>
          <div className="i-d-grid">
            <div className="i-d-metrics">
              <Metric icon={Waves} value={`${fmtNum(ward.water_pct, 1)}%`} label={`${t.ofLand} (${fmtNum(ward.water_km2, 2)} km²)`} share={ward.water_pct / 100} />
              <Metric icon={Sprout} value={`${fmtNum(ward.crop_ha, 0)} ha`} label={t.crop} share={ward.crop_total_ha ? ward.crop_ha / ward.crop_total_ha : 0} />
              <Metric icon={Route} value={`${fmtNum(ward.roads_km, 2)} km`} label={t.roads} />
              <Metric icon={Building2} value={String(ward.facilities)} label={t.fac} />
            </div>
            <div className="i-d-actions">
              <h3>{t.actions}</h3>
              <ul>
                {actionsFor(ward, t).map((a) => (
                  <li key={a}><Check size={16} aria-hidden="true" />{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <p className="i-empty">{t.pick}</p>
      )}

      <details className="i-method">
        <summary>{t.method}</summary>
        <p>{data.method}</p>
        <p>{data.score}</p>
        <p className="i-caveat">{t.caveat}</p>
      </details>

      {/* print-only full table */}
      <table className="i-print-table">
        <thead><tr><th>{t.rank}</th><th>Area</th><th>%</th><th>ha</th><th>km</th><th>{t.fac}</th></tr></thead>
        <tbody>{data.wards.slice(0, 20).map((w) => <tr key={w.id}><td>{w.rank}</td><td>{w.name}</td><td>{w.water_pct}</td><td>{w.crop_ha}</td><td>{w.roads_km}</td><td>{w.facilities}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Metric({ icon: Icon, value, label, share }: { icon: typeof Waves; value: string; label: string; share?: number }) {
  return (
    <div className="i-metric">
      <Icon size={18} aria-hidden="true" />
      <strong>{value}</strong>
      <span>{label}</span>
      {share !== undefined && <span className="i-metric-bar"><span style={{ width: `${Math.min(100, share * 100)}%` }} /></span>}
    </div>
  );
}

function ImpactMap({ data, selected, onSelect, label }: { data: Impact; selected: string | null; onSelect: (id: string) => void; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const idx = useRef<Map<string, number>>(new Map());
  const prev = useRef<number | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;

  useEffect(() => {
    if (!MAPBOX_CONFIGURED) return;
    let dead = false;
    let off: (() => void) | undefined;
    loadMapbox().then((ml) => {
      if (dead || !el.current) return;
      const [W, S, E, N] = data.bounds;
      const m = new ml.Map({ container: el.current, style: mapStyle(), accessToken: MAPBOX_TOKEN, bounds: [[W, S], [E, N]], fitBoundsOptions: { padding: 24 }, attributionControl: false });
      map.current = m;
      off = followMapTheme(m);
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new ml.AttributionControl({ compact: true }));
      m.on("load", async () => {
        const wards = await (await fetch(`${DIR}wards.geojson`)).json();
        wards.features.forEach((f: { id: number; properties: { id: string } }) => idx.current.set(f.properties.id, f.id));
        const lvl = ["match", ["get", "level"], "severe", LEVEL_COLOR.severe, "high", LEVEL_COLOR.high, "moderate", LEVEL_COLOR.moderate, LEVEL_COLOR.low];
        m.addSource("wards", { type: "geojson", data: wards });
        m.addLayer({ id: "wards-fill", type: "fill", source: "wards", paint: { "fill-color": lvl, "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.42, ["boolean", ["feature-state", "hover"], false], 0.32, 0.2] } });
        m.addSource("flood", { type: "image", url: data.overlay, coordinates: [[W, N], [E, N], [E, S], [W, S]] });
        m.addLayer({ id: "flood", type: "raster", source: "flood", paint: { "raster-opacity": 0.95, "raster-resampling": "nearest" } });
        m.addLayer({ id: "wards-line", type: "line", source: "wards", paint: { "line-color": lvl, "line-width": 1, "line-opacity": 0.7 } });
        m.addLayer({ id: "wards-sel", type: "line", source: "wards", paint: { "line-color": "#ffffff", "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.5, 0] } });
        m.addSource("roads", { type: "geojson", data: `${DIR}roads.geojson` });
        m.addLayer({ id: "roads", type: "line", source: "roads", paint: { "line-color": "#ff5fa2", "line-width": ["case", ["get", "major"], 3.2, 2], "line-opacity": 0.95 } });
        m.addSource("fac", { type: "geojson", data: `${DIR}facilities.geojson` });
        m.addLayer({ id: "fac", type: "circle", source: "fac", paint: { "circle-radius": ["case", ["get", "affected"], 6, 3.2], "circle-color": ["case", ["get", "affected"], "#ff5fa2", "#f4f7fa"], "circle-stroke-color": "#0b1422", "circle-stroke-width": 1.2 } });
        m.addSource("ranks", { type: "geojson", data: { type: "FeatureCollection", features: data.wards.filter((w) => w.rank <= 10).map((w) => ({ type: "Feature", geometry: { type: "Point", coordinates: w.center }, properties: { rank: String(w.rank) } })) } });
        m.addLayer({ id: "ranks-dot", type: "circle", source: "ranks", paint: { "circle-radius": 11, "circle-color": "#0b1422", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
        m.addLayer({ id: "ranks", type: "symbol", source: "ranks", layout: { "text-field": ["get", "rank"], "text-size": 12, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } });
        let hov: number | null = null;
        m.on("mousemove", "wards-fill", (e) => {
          const id = e.features?.[0]?.id as number | undefined;
          if (hov !== null) m.setFeatureState({ source: "wards", id: hov }, { hover: false });
          hov = id ?? null;
          if (hov !== null) m.setFeatureState({ source: "wards", id: hov }, { hover: true });
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", "wards-fill", () => { if (hov !== null) m.setFeatureState({ source: "wards", id: hov }, { hover: false }); hov = null; m.getCanvas().style.cursor = ""; });
        m.on("click", "wards-fill", (e) => { const p = e.features?.[0]?.properties; if (p?.id) pick.current(p.id); });
        m.fire("impact:ready");
      });
    });
    return () => { dead = true; off?.(); map.current?.remove(); map.current = null; };
  }, [data]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!m.getSource("wards")) return;
      if (prev.current !== null) m.setFeatureState({ source: "wards", id: prev.current }, { sel: false });
      const id = selected ? idx.current.get(selected) : undefined;
      prev.current = id ?? null;
      if (id === undefined) return;
      m.setFeatureState({ source: "wards", id }, { sel: true });
      const w = data.wards.find((x) => x.id === selected);
      if (w) m.easeTo({ center: w.center, zoom: Math.max(m.getZoom(), 12), duration: cameraDuration() });
    };
    if (m.getSource("wards")) apply();
    else m.once("impact:ready", apply);
  }, [selected, data]);

  if (!MAPBOX_CONFIGURED) return <MapUnavailable />;
  return <div ref={el} className="i-map" role="region" aria-label={label} />;
}
