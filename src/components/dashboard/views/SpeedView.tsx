"use client";

import { ChevronLeft, ChevronRight, Gauge } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { SpeedMap } from "../SpeedMap";
import { Card, PageHead, Toggle } from "../ui";
import { RAMP_CSS, UNIT_LABEL, fmtDay, fmtDayShort, toUnit } from "@/lib/dashboard-data";
import { setSettings, useSettings } from "@/lib/dashboard-settings";

export function SpeedView() {
  const { manifest, fronts, timeseries, pairIdx, setPairIdx } = useDashboard();
  const settings = useSettings();
  const pair = manifest.pairs[pairIdx];
  const unit = UNIT_LABEL[settings.units];
  const layers = settings.layers;
  const row = timeseries.series[pairIdx];

  return (
    <>
      <PageHead
        crumbs={["Ice speed"]}
        actions={
          <div className="d-stepper" role="group" aria-label="Change pass pair">
            <button type="button" className="d-btn" onClick={() => setPairIdx(pairIdx - 1)} disabled={pairIdx === 0}>
              <ChevronLeft size={16} aria-hidden="true" />
              Earlier
            </button>
            <button type="button" className="d-btn" onClick={() => setPairIdx(pairIdx + 1)} disabled={pairIdx === manifest.pairs.length - 1}>
              Later
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        }
      />
      <Card title="Ice speed map" icon={Gauge} sub={`${fmtDay(pair.start)} to ${fmtDay(pair.end)}, ${pair.days} days apart`} className="d-mapcard">
        <div className="d-mapgrid">
          <SpeedMap manifest={manifest} fronts={fronts} pair={pair} layers={layers} units={settings.units} />
          <aside className="d-controls" aria-label="Map controls">
            <div className="d-field">
              <label htmlFor="pair">Pass pair</label>
              <output htmlFor="pair" className="d-pair-out">
                {fmtDayShort(pair.start)} → {fmtDayShort(pair.end)}
              </output>
              <input id="pair" type="range" min={0} max={manifest.pairs.length - 1} value={pairIdx} onChange={(e) => setPairIdx(Number(e.target.value))} aria-valuetext={`${fmtDay(pair.start)} to ${fmtDay(pair.end)}`} />
              <small>
                {pairIdx + 1} of {manifest.pairs.length} pairs
              </small>
            </div>
            <dl className="d-probe-list">
              {manifest.probes.map((p) => (
                <div key={p.id}>
                  <dt>{p.label}</dt>
                  <dd>{typeof row?.[p.id] === "number" ? `${toUnit(row[p.id] as number, settings.units).toFixed(1)} ${unit}` : "–"}</dd>
                </div>
              ))}
            </dl>
            <fieldset className="d-fieldset">
              <legend>Layers</legend>
              <Toggle label="Ice speed" checked={layers.speed} onChange={(v) => setSettings({ layers: { ...layers, speed: v } })} />
              <Toggle label="Calving fronts" checked={layers.fronts} onChange={(v) => setSettings({ layers: { ...layers, fronts: v } })} />
              <Toggle label="Flowline and probes" checked={layers.probes} onChange={(v) => setSettings({ layers: { ...layers, probes: v } })} />
            </fieldset>
            <div className="d-field">
              <span className="d-label">Speed, {unit}</span>
              <div className="d-ramp" style={{ background: RAMP_CSS }} />
              <div className="d-ramp-ticks">
                <span>0</span>
                <span>{toUnit(manifest.speedMax * 0.375, settings.units).toFixed(0)}</span>
                <span>{toUnit(manifest.speedMax * 0.75, settings.units).toFixed(0)}+</span>
              </div>
            </div>
            <p className="d-key-front">
              <i className="is-old" /> Earlier fronts <i className="is-now" /> This pair
            </p>
          </aside>
        </div>
      </Card>
    </>
  );
}
