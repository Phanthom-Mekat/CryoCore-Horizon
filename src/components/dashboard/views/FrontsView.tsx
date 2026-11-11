"use client";

import { Map as MapIcon, Mountain, MoveLeft, MoveRight, Ruler, Table2 } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { LineChart } from "../LineChart";
import { SpeedMap } from "../SpeedMap";
import { Card, Kpi, KpiStrip, PageHead } from "../ui";
import { fmtDay, fmtDayShort } from "@/lib/dashboard-data";

export function FrontsView() {
  const { manifest, fronts, pairIdx, setPairIdx } = useDashboard();
  const base = fronts.fronts[0]?.advanceKm ?? 0;
  const rel = fronts.fronts.map((f) => Math.round((f.advanceKm - base) * 100) / 100);
  const pair = manifest.pairs[pairIdx];
  const sel = Math.max(0, fronts.fronts.findIndex((f) => f.date === pair.end));
  const maxI = rel.indexOf(Math.max(...rel));
  const minI = rel.indexOf(Math.min(...rel));
  const fmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

  return (
    <>
      <PageHead crumbs={["Calving front"]} />
      <KpiStrip label="Calving front summary">
        <Kpi label={`Front on ${fmtDayShort(fronts.fronts[sel].date)}`} value={fmt(rel[sel])} unit="km" icon={Ruler} sub="Against the first pass" />
        <Kpi label="Furthest advance" value={fmt(rel[maxI])} unit="km" icon={MoveLeft} sub={fmtDay(fronts.fronts[maxI].date)} />
        <Kpi label="Furthest retreat" value={fmt(rel[minI])} unit="km" icon={MoveRight} sub={fmtDay(fronts.fronts[minI].date)} />
        <Kpi label="Seasonal range" value={(rel[maxI] - rel[minI]).toFixed(1)} unit="km" icon={Mountain} sub={`${fronts.fronts.length} passes`} />
      </KpiStrip>
      <div className="d-grid d-grid-1-1">
        <Card title="Front position over time" icon={Mountain} sub="Advance (+) or retreat (−) along the flowline. Click a date to select it.">
          <LineChart
            dates={fronts.fronts.map((f) => new Date(f.date))}
            unit="km"
            zeroLine
            selected={sel}
            onSelect={(i) => setPairIdx(i - 1)}
            format={fmt}
            ariaLabel="Calving front position over time. Use the arrow keys to change the selected pass."
            series={[{ id: "front", label: "Front position", color: "#e9f0f6", values: rel, area: false }]}
          />
        </Card>
        <Card title="Fronts on the map" icon={MapIcon} sub={`All ${fronts.fronts.length} picks; the bright line is ${fmtDay(fronts.fronts[sel].date)}`}>
          <SpeedMap manifest={manifest} fronts={fronts} pair={pair} layers={{ speed: false, fronts: true, probes: true }} />
        </Card>
      </div>
      <Card title="Front positions" icon={Table2} sub="Every pass, newest first">
        <div className="d-table-wrap">
          <table className="d-table">
            <thead>
              <tr>
                <th scope="col">Pass</th>
                <th scope="col" className="num">Position vs first pass</th>
                <th scope="col" className="num">Change since previous</th>
              </tr>
            </thead>
            <tbody>
              {fronts.fronts
                .map((f, i) => ({ f, i }))
                .reverse()
                .map(({ f, i }) => (
                  <tr key={f.date} className={i === sel ? "is-selected" : undefined}>
                    <th scope="row">
                      <button type="button" onClick={() => setPairIdx(i - 1)}>
                        {fmtDay(f.date)}
                      </button>
                    </th>
                    <td className="num">{fmt(rel[i])} km</td>
                    <td className={`num ${i === 0 ? "" : rel[i] - rel[i - 1] >= 0 ? "is-up" : "is-down"}`}>{i === 0 ? "–" : `${fmt(rel[i] - rel[i - 1])} km`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
