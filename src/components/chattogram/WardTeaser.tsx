"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { fmtNum } from "@/lib/i18n/format";
import { useLang } from "@/lib/i18n/useT";
import { useCase } from "./CaseProvider";

type Ward = { name: string; rank: number; water_km2: number; water_pct: number; crop_ha?: number; roads_km?: number; facilities?: number };

const TEXT = {
  en: { eyebrow: "Who is affected", title: "Most affected wards", water: "km² water", roads: "km roads", fac: "facilities", open: "See every ward" },
  bn: { eyebrow: "কারা ক্ষতিগ্রস্ত", title: "সবচেয়ে ক্ষতিগ্রস্ত ওয়ার্ড", water: "বর্গ কিমি পানি", roads: "কিমি সড়ক", fac: "স্থাপনা", open: "সব ওয়ার্ড দেখুন" },
};

/** Top wards from the Impact page's ranking (public/data/chattogram/impact/impact.json); renders nothing until it exists. */
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
  if (!wards.length) return null;
  return (
    <section className="c-honest" aria-labelledby="wards-h" style={{ display: "block" }}>
      <p className="c-eyebrow">{s.eyebrow}</p>
      <h2 id="wards-h" style={{ margin: "4px 0 12px" }}>{s.title}</h2>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
        {wards.map((w) => (
          <li key={w.name}>
            <MapPin size={14} aria-hidden="true" /> <strong>{w.name}</strong> — {fmtNum(w.water_km2, 2)} {s.water} ({fmtNum(w.water_pct, 1)}%)
            {w.roads_km != null && ` · ${fmtNum(w.roads_km, 1)} ${s.roads}`}
            {w.facilities != null && ` · ${fmtNum(w.facilities)} ${s.fac}`}
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 12 }}>
        <Link className="c-btn is-primary" href={href("/chattogram/impact")}>
          {s.open} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
