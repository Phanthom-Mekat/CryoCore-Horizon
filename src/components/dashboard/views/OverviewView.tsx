"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Download, Gauge, HeartPulse, Map as MapIcon, Mountain, Satellite, Search, SlidersHorizontal, Table2, TrendingUp } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { LineChart } from "../LineChart";
import { Card, Kpi, KpiStrip, Meter, PageHead, Toggle } from "../ui";
import { SERIES_COLORS, UNIT_LABEL, fmtDay, fmtDayShort, midDate, nearestIndex, season, smooth3, toCsv, toUnit } from "@/lib/dashboard-data";
import { setSettings, useSettings } from "@/lib/dashboard-settings";

const SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  fastest: "Fastest first",
  change: "Biggest change",
} as const;

export function OverviewView() {
  const { manifest, timeseries, fronts, pairIdx, setPairIdx, alerts } = useDashboard();
  const settings = useSettings();
  const router = useRouter();
  const u = settings.units;
  const unit = UNIT_LABEL[u];
  const [q, setQ] = useState("");
  const [seasonF, setSeasonF] = useState("All");
  const [sort, setSort] = useState<keyof typeof SORTS>("newest");

  const pair = manifest.pairs[pairIdx];
  const val = (i: number, id = "front") => {
    const v = timeseries.series[i]?.[id];
    return typeof v === "number" ? v : null;
  };
  const now = val(pairIdx);
  const prev = val(pairIdx - 1);
  const firstFront = fronts.fronts[0]?.advanceKm ?? 0;
  const endFront = fronts.fronts.length ? fronts.fronts[nearestIndex(fronts.fronts.map((f) => f.date), pair.end)] : undefined;
  const frontKm = endFront ? endFront.advanceKm - firstFront : null;
  const peak = timeseries.series.reduce((b, r, i) => (typeof r.front === "number" && r.front > b.v ? { v: r.front, i } : b), { v: -Infinity, i: 0 });

  // data health: honest ratios computed from what is on disk
  const withBoth = timeseries.series.filter((r) => manifest.probes.every((p) => typeof r[p.id] === "number")).length;
  const radarCount = manifest.passes.filter((p) => p.radar).length;
  const health = [
    { label: "Pairs with ice speed", value: manifest.pairs.length / Math.max(1, manifest.passes.length - 1), display: `${manifest.pairs.length} of ${manifest.passes.length - 1}` },
    { label: "Probe readings present", value: withBoth / Math.max(1, timeseries.series.length), display: `${Math.round((withBoth / Math.max(1, timeseries.series.length)) * 100)}%` },
    { label: "Calving fronts picked", value: fronts.fronts.length / manifest.passes.length, display: `${fronts.fronts.length} of ${manifest.passes.length}` },
    { label: "Passes with radar previews", value: radarCount / manifest.passes.length, display: `${radarCount} of ${manifest.passes.length}`, note: manifest.sample ? "The sample keeps a preview for every 4th pass to save space." : undefined },
  ];

  const series = manifest.probes.map((p, k) => {
    const raw = timeseries.series.map((r) => (typeof r[p.id] === "number" ? toUnit(r[p.id] as number, u) : null));
    return { id: p.id, label: p.label, color: SERIES_COLORS[p.id] ?? "#9ab", values: settings.smooth ? smooth3(raw) : raw, area: k === 0 };
  });

  const rows = useMemo(() => {
    const all = manifest.pairs.map((p, i) => {
      const f = typeof timeseries.series[i]?.front === "number" ? (timeseries.series[i].front as number) : null;
      const pf = typeof timeseries.series[i - 1]?.front === "number" ? (timeseries.series[i - 1].front as number) : null;
      const up = typeof timeseries.series[i]?.upstream === "number" ? (timeseries.series[i].upstream as number) : null;
      return { i, p, front: f, up, change: f !== null && pf !== null ? f - pf : null, season: season(midDate(p).toISOString()) };
    });
    const needle = q.trim().toLowerCase();
    const shown = all.filter(
      (r) =>
        (seasonF === "All" || r.season === seasonF) &&
        (!needle || `${fmtDay(r.p.start)} ${fmtDay(r.p.end)} ${r.p.start} ${r.p.end}`.toLowerCase().includes(needle)),
    );
    const by: Record<keyof typeof SORTS, (a: (typeof all)[0], b: (typeof all)[0]) => number> = {
      newest: (a, b) => b.i - a.i,
      oldest: (a, b) => a.i - b.i,
      fastest: (a, b) => (b.front ?? -1) - (a.front ?? -1),
      change: (a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0),
    };
    return shown.sort(by[sort]);
  }, [manifest, timeseries, q, seasonF, sort]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(manifest, timeseries, fronts, u)], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `jakobshavn-speed${manifest.sample ? "-SAMPLE" : ""}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const sign = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

  return (
    <>
      <PageHead
        crumbs={["Overview"]}
        actions={
          <>
            <button type="button" className="d-btn" onClick={exportCsv}>
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>
            <Link href="/dashboard/speed" className="d-btn is-primary">
              <MapIcon size={16} aria-hidden="true" />
              Open the speed map
            </Link>
          </>
        }
      />

      <KpiStrip label={`Summary for ${fmtDay(pair.start)} to ${fmtDay(pair.end)}`}>
        <Kpi
          label="Speed near the front"
          value={now === null ? "–" : toUnit(now, u).toFixed(1)}
          unit={unit}
          icon={Gauge}
          sub={now !== null && prev !== null ? `${sign(toUnit(now - prev, u))} vs previous pair` : `${fmtDayShort(pair.start)} → ${fmtDayShort(pair.end)}`}
          tone={now !== null && prev !== null && now !== prev ? (now > prev ? "up" : "down") : undefined}
        />
        <Kpi label="Fastest pair in the record" value={Number.isFinite(peak.v) ? toUnit(peak.v, u).toFixed(1) : "–"} unit={unit} icon={TrendingUp} sub={`${fmtDayShort(manifest.pairs[peak.i].start)} → ${fmtDayShort(manifest.pairs[peak.i].end)}`} />
        <Kpi label="Calving front vs first pass" value={frontKm === null ? "–" : sign(frontKm)} unit="km" icon={Mountain} sub={frontKm === null ? "No front picked" : frontKm > 0 ? "Advanced since the first pass" : frontKm < 0 ? "Retreated since the first pass" : "Same place as the first pass"} />
        <Kpi label="NISAR passes" value={String(manifest.passes.length)} icon={Satellite} sub={`Track ${manifest.passes[0]?.track}, frame ${manifest.passes[0]?.frame}, every 12 days`} />
      </KpiStrip>

      <div className="d-grid d-grid-2-1">
        <Card
          title="Ice speed through the year"
          icon={Activity}
          sub={`Average speed between passes at the two probe points${settings.smooth ? ", smoothed over 3 pairs" : ""}. Click a date to select it.`}
        >
          <LineChart
            dates={manifest.pairs.map(midDate)}
            unit={unit}
            selected={pairIdx}
            onSelect={setPairIdx}
            series={series}
            ariaLabel="Ice speed through the year. Use the arrow keys to change the selected pair."
          />
        </Card>
        <Card title="Data health" icon={HeartPulse} sub="How complete the record is">
          <div className="d-meters">
            {health.map((h) => (
              <Meter key={h.label} label={h.label} value={h.value} display={h.display} tone={h.value < 0.8 ? "warn" : "ok"} note={h.note} />
            ))}
          </div>
          <Link href="/dashboard/alerts" className="d-card-link">
            {alerts.filter((a) => a.kind !== "peak").length} alerts from the data
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      <div className="d-grid d-grid-1-2">
        <Card title="Display settings" icon={SlidersHorizontal} sub="Applied on every page and remembered in this browser">
          <div className="d-field">
            <label htmlFor="units">Speed units</label>
            <select id="units" value={u} onChange={(e) => setSettings({ units: e.target.value as typeof u })}>
              <option value="mday">Metres per day (m/day)</option>
              <option value="kmyr">Kilometres per year (km/yr)</option>
            </select>
          </div>
          <Toggle label="Smooth the charts" hint="3-pair running mean" checked={settings.smooth} onChange={(v) => setSettings({ smooth: v })} />
          <Toggle label="Speed layer on the map" checked={settings.layers.speed} onChange={(v) => setSettings({ layers: { ...settings.layers, speed: v } })} />
          <Toggle label="Calving fronts on the map" checked={settings.layers.fronts} onChange={(v) => setSettings({ layers: { ...settings.layers, fronts: v } })} />
          <Toggle label="Flowline and probe points" checked={settings.layers.probes} onChange={(v) => setSettings({ layers: { ...settings.layers, probes: v } })} />
        </Card>

        <Card title="Pass pairs" icon={Table2} sub={`${rows.length} of ${manifest.pairs.length} pairs. Select a row to open it on the map.`}>
          <div className="d-filters">
            <label className="d-input">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Search by date" aria-label="Search pairs by date" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select aria-label="Filter by season" value={seasonF} onChange={(e) => setSeasonF(e.target.value)}>
              {["All", "Winter", "Spring", "Summer", "Autumn"].map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All seasons" : s}
                </option>
              ))}
            </select>
            <select aria-label="Sort pairs" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  Sort: {v}
                </option>
              ))}
            </select>
          </div>
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th scope="col">Pair</th>
                  <th scope="col">Season</th>
                  <th scope="col" className="num">Near front</th>
                  <th scope="col" className="num">Upstream</th>
                  <th scope="col" className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i} className={r.i === pairIdx ? "is-selected" : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        onClick={() => {
                          setPairIdx(r.i);
                          router.push("/dashboard/speed");
                        }}
                      >
                        {fmtDayShort(r.p.start)} → {fmtDay(r.p.end)}
                      </button>
                    </th>
                    <td>{r.season}</td>
                    <td className="num">{r.front === null ? "–" : toUnit(r.front, u).toFixed(1)}</td>
                    <td className="num">{r.up === null ? "–" : toUnit(r.up, u).toFixed(1)}</td>
                    <td className={`num ${r.change === null ? "" : r.change >= 0 ? "is-up" : "is-down"}`}>{r.change === null ? "–" : sign(toUnit(r.change, u))}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="d-empty">
                      No pairs match. Clear the search or pick another season.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="d-foot-note">Speeds in {unit}. Change is against the previous pair.</p>
        </Card>
      </div>
    </>
  );
}
