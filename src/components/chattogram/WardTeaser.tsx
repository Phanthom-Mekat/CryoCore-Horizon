"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Cloud, Film, MapPin } from "lucide-react";
import { fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";
import { useCase } from "./CaseProvider";

type Ward = { name: string; rank: number; water_km2: number; water_pct: number; crop_ha?: number; roads_km?: number; facilities?: number };

const TEXT = {
  en: {
    people: "For people", peopleTitle: "Use the radar yourself",
    cards: [
      { href: "/chattogram/my-area", icon: MapPin, title: "My area", sub: "Your ward, nearest help, rain ahead, farm advice. Listen or share." },
      { href: "/chattogram/clouds", icon: Cloud, title: "Through the clouds", sub: "What a camera saw vs what NISAR saw on the same monsoon morning." },
      { href: "/chattogram/timelapse", icon: Film, title: "Monsoon time-lapse", sub: "Every radar pass of the season, with the rain filling in." },
    ],
    eyebrow: "Who is affected", title: "Most affected wards", water: "km² water", roads: "km roads", fac: "facilities", open: "See every ward",
  },
  bn: {
    people: "সবার জন্য", peopleTitle: "নিজেই রাডার ব্যবহার করুন",
    cards: [
      { href: "/chattogram/my-area", icon: MapPin, title: "আমার এলাকা", sub: "আপনার ওয়ার্ড, কাছের সাহায্য, আসন্ন বৃষ্টি, কৃষি পরামর্শ। শুনুন বা শেয়ার করুন।" },
      { href: "/chattogram/clouds", icon: Cloud, title: "মেঘ ভেদ করে", sub: "একই বর্ষার সকালে ক্যামেরা কী দেখেছে আর নাইসার কী দেখেছে।" },
      { href: "/chattogram/timelapse", icon: Film, title: "বর্ষার টাইম-ল্যাপস", sub: "মৌসুমের প্রতিটি রাডার পর্যবেক্ষণ, সাথে বৃষ্টির হিসাব।" },
    ],
    eyebrow: "কারা ক্ষতিগ্রস্ত", title: "সবচেয়ে ক্ষতিগ্রস্ত ওয়ার্ড", water: "বর্গ কিমি পানি", roads: "কিমি সড়ক", fac: "স্থাপনা", open: "সব ওয়ার্ড দেখুন",
  },
};

/** Overview entry points for the public pages, plus the top wards from the Impact ranking once impact.json exists. */
export function WardTeaser() {
  const { href } = useCase();
  const s = TEXT[useLang()];
  const [wards, setWards] = useState<Ward[]>([]);
  useEffect(() => {
    fetch("/data/chattogram/impact/impact.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Ward[] = d?.features?.map((f: { properties: Ward }) => f.properties) ?? d?.wards ?? (Array.isArray(d) ? d : []);
        setWards(list.filter((w) => w?.name).sort((a, b) => a.rank - b.rank).slice(0, 5));
      })
      .catch(() => {});
  }, []);
  return (
    <>
      <section className="ov-people" aria-labelledby="people-h">
        <p className="c-eyebrow">{s.people}</p>
        <h2 id="people-h">{s.peopleTitle}</h2>
        <div className="ov-people-grid">
          {s.cards.map(({ href: to, icon: Icon, title, sub }) => (
            <Link key={to} href={href(to)} className="ov-people-card">
              <span className="ov-people-ic"><Icon size={22} aria-hidden="true" /></span>
              <strong>{title}</strong>
              <span>{sub}</span>
              <ArrowRight className="ov-people-go" size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
        <style>{`
          .ov-people { display: grid; gap: 6px; }
          .ov-people h2 { margin: 0 0 8px; }
          .ov-people-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
          .ov-people-card { position: relative; display: grid; gap: 6px; padding: 20px 20px 22px; border-radius: 18px; border: 1px solid var(--d-line); color: var(--text); text-decoration: none;
            background: radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--radar, #2dd4bf) 16%, transparent), transparent 65%), var(--d-card); transition: transform .18s, border-color .18s, box-shadow .18s; }
          .ov-people-card:hover { transform: translateY(-3px); border-color: var(--radar, #2dd4bf); box-shadow: 0 16px 36px rgba(0,0,0,.18); }
          .ov-people-card strong { font-size: 1.15rem; }
          .ov-people-card > span:not(.ov-people-ic) { color: var(--muted); font-size: .92rem; line-height: 1.5; padding-right: 22px; }
          .ov-people-ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: var(--radar, #2dd4bf); color: #04211d; margin-bottom: 6px; }
          .ov-people-go { position: absolute; right: 18px; bottom: 20px; color: var(--radar, #2dd4bf); transition: transform .18s; }
          .ov-people-card:hover .ov-people-go { transform: translateX(4px); }
        `}</style>
      </section>

      {wards.length > 0 && (
        <section className="ov-wards" aria-labelledby="wards-h">
          <div className="ov-wards-head">
            <div>
              <p className="c-eyebrow">{s.eyebrow}</p>
              <h2 id="wards-h">{s.title}</h2>
            </div>
            <Link className="c-btn is-primary" href={href("/chattogram/impact")}>
              {s.open} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ol className="ov-wards-list">
            {wards.map((w, i) => (
              <li key={w.name}>
                <span className="ov-wards-n">{fmtNum(i + 1)}</span>
                <div className="ov-wards-main">
                  <strong>{w.name}</strong>
                  <span className="ov-wards-bar"><i style={{ width: `${Math.min(100, (w.water_pct / Math.max(...wards.map((x) => x.water_pct))) * 100)}%` }} /></span>
                  <small>
                    {fmtNum(w.water_km2, 2)} {s.water}
                    {w.roads_km != null && ` · ${fmtNum(w.roads_km, 1)} ${s.roads}`}
                    {w.facilities ? ` · ${fmtNum(w.facilities)} ${s.fac}` : ""}
                  </small>
                </div>
                <span className="ov-wards-pct">{fmtNum(w.water_pct, 1)}<small>%</small></span>
              </li>
            ))}
          </ol>
          <style>{`
            .ov-wards { display: grid; gap: 14px; padding: clamp(18px, 3vw, 28px); border-radius: 20px; border: 1px solid var(--d-line); background: var(--d-card); }
            .ov-wards-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: end; }
            .ov-wards-head h2 { margin: 4px 0 0; }
            .ov-wards-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
            .ov-wards-list li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 12px 14px; border-radius: 14px; background: color-mix(in srgb, var(--text) 4%, transparent); }
            .ov-wards-n { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: color-mix(in srgb, #f43f5e 14%, transparent); color: #e11d48; font-weight: 700; }
            .ov-wards-main { display: grid; gap: 6px; min-width: 0; }
            .ov-wards-main small { color: var(--muted); }
            .ov-wards-bar { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--text) 8%, transparent); overflow: hidden; }
            .ov-wards-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #f43f5e); }
            .ov-wards-pct { font-size: 1.5rem; font-weight: 700; color: #e11d48; font-variant-numeric: tabular-nums; }
            .ov-wards-pct small { font-size: .9rem; }
          `}</style>
        </section>
      )}
    </>
  );
}
