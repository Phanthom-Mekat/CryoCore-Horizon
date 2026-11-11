"use client";

import { useState } from "react";
import { Images, Radar } from "lucide-react";
import { CompareSlider } from "@/components/CompareSlider";
import { useDashboard } from "../DashboardProvider";
import { Card, PageHead } from "../ui";
import { DATA_ROOT, fmtDay } from "@/lib/dashboard-data";

export function RadarView() {
  const { manifest } = useDashboard();
  const passes = manifest.passes.filter((p) => p.radar);
  const [a, setA] = useState(passes[0]?.date ?? "");
  const [b, setB] = useState(passes[passes.length - 1]?.date ?? "");
  const src = (d: string) => DATA_ROOT + passes.find((p) => p.date === d)!.radar!;

  if (passes.length < 2)
    return (
      <>
        <PageHead crumbs={["Radar images"]} />
        <div className="d-state">
          <p>Fewer than two radar previews are available. Run the pipeline’s build step to create them from GCOV files.</p>
        </div>
      </>
    );

  return (
    <>
      <PageHead crumbs={["Radar images"]} />
      <Card title="Before and after" icon={Radar} sub="L-band backscatter (HH). Bright is rough glacier ice, dark is open water and smooth surfaces.">
        <div className="d-filters">
          <label className="d-field-inline">
            Before
            <select value={a} onChange={(e) => setA(e.target.value)}>
              {passes.map((p) => (
                <option key={p.date} value={p.date}>
                  {fmtDay(p.date)}
                </option>
              ))}
            </select>
          </label>
          <label className="d-field-inline">
            After
            <select value={b} onChange={(e) => setB(e.target.value)}>
              {passes.map((p) => (
                <option key={p.date} value={p.date}>
                  {fmtDay(p.date)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="d-radar">
          <CompareSlider
            // eslint-disable-next-line @next/next/no-img-element -- generated radar preview
            before={<img src={src(a)} alt={`Radar image of the glacier front, ${fmtDay(a)}`} />}
            // eslint-disable-next-line @next/next/no-img-element -- generated radar preview
            after={<img src={src(b)} alt={`Radar image of the glacier front, ${fmtDay(b)}`} />}
            beforeLabel={fmtDay(a)}
            afterLabel={fmtDay(b)}
          />
        </div>
      </Card>
      <Card title="All radar previews" icon={Images} sub="Select one to show it on the right of the slider">
        <ul className="d-gallery">
          {passes.map((p) => (
            <li key={p.date}>
              <button type="button" onClick={() => setB(p.date)} aria-pressed={p.date === b}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated radar preview */}
                <img src={DATA_ROOT + p.radar} alt="" loading="lazy" />
                <span>{fmtDay(p.date)}</span>
                <small>
                  Track {p.track}, {p.direction === "A" ? "ascending" : "descending"}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
