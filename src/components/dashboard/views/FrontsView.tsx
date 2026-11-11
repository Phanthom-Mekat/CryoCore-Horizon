"use client";

import { useState } from "react";
import { Map as MapIcon, Mountain, MoveLeft, MoveRight, Ruler, Table2 } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { LineChart } from "../LineChart";
import { SpeedMap } from "../SpeedMap";
import { Card, Kpi, KpiStrip, PageHead } from "../ui";
import { fmtDay, fmtDayShort, nearestIndex } from "@/lib/dashboard-data";

export function FrontsView() {
  const { manifest, fronts, pairIdx, setPairIdx } = useDashboard();
  const dates = fronts.fronts.map((f) => f.date);
  const pairEnds = manifest.pairs.map((p) => p.end);
  // fronts come from GCOV passes and speed pairs from GOFF products, so the two are matched by date, not by index
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? (dates.length ? nearestIndex(dates, manifest.pairs[pairIdx].end) : 0);
  const select = (i: number) => {
    setPicked(i);
    setPairIdx(nearestIndex(pairEnds, dates[i]));
  };

  if (!fronts.fronts.length)
    return (
      <>
        <PageHead crumbs={["Calving front"]} />
        <div className="d-state">
          <p>No calving fronts have been picked yet. The pipeline’s build step picks one from each GCOV radar image.</p>
        </div>
      </>
    );

  const base = fronts.fronts[0].advanceKm;
  const rel = fronts.fronts.map((f) => Math.round((f.advanceKm - base) * 100) / 100);
  const pair = manifest.pairs[pairIdx];
  const maxI = rel.indexOf(Math.max(...rel));
  const minI = rel.indexOf(Math.min(...rel));
  const r1 = (v: number) => Math.round(v * 10) / 10; // sign follows the shown value, so no "−0.0"
  const fmt = (v: number) => `${r1(v) > 0 ? "+" : r1(v) < 0 ? "−" : ""}${Math.abs(r1(v)).toFixed(1)}`;
  const tone = (v: number) => (r1(v) > 0 ? "is-up" : r1(v) < 0 ? "is-down" : "");

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
            onSelect={select}
            format={fmt}
            ariaLabel="Calving front position over time. Use the arrow keys to change the selected pass."
            series={[{ id: "front", label: "Front position", color: "#e9f0f6", values: rel, area: false }]}
          />
        </Card>
        <Card title="Fronts on the map" icon={MapIcon} sub={`All ${fronts.fronts.length} picks; the bright line is ${fmtDay(fronts.fronts[sel].date)}`}>
          <SpeedMap manifest={manifest} fronts={fronts} pair={pair} frontDate={dates[sel]} layers={{ speed: false, fronts: true, probes: true }} />
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
                      <button type="button" onClick={() => select(i)} aria-pressed={i === sel}>
                        {fmtDay(f.date)}
                      </button>
                    </th>
                    <td className="num">{fmt(rel[i])} km</td>
                    <td className={`num ${i === 0 ? "" : tone(rel[i] - rel[i - 1])}`}>{i === 0 ? "–" : `${fmt(rel[i] - rel[i - 1])} km`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
