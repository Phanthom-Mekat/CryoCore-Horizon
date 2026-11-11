"use client";

import { useEffect, useState } from "react";
import { Images, Radar } from "lucide-react";
import { CompareSlider } from "@/components/CompareSlider";
import { useDashboard } from "../DashboardProvider";
import { Card, PageHead } from "../ui";
import { DATA_ROOT, directionLabel, fmtDay } from "@/lib/dashboard-data";

const MODES = [
  { id: "swipe", label: "Swipe", hint: "Drag the handle to wipe between the two dates." },
  { id: "diff", label: "Difference", hint: "Pixel difference of the two images: bright means the backscatter changed (a moving front, calving, new mélange), dark means it stayed the same." },
  { id: "blink", label: "Blink", hint: "Flips between the dates so motion stands out, the way glaciologists check fronts by eye." },
] as const;
type Mode = (typeof MODES)[number]["id"];
const REDUCED = "(prefers-reduced-motion: reduce)";

export function RadarView() {
  const { manifest } = useDashboard();
  const passes = manifest.passes.filter((p) => p.radar);
  const [a, setA] = useState(passes[0]?.date ?? "");
  const [b, setB] = useState(passes[passes.length - 1]?.date ?? "");
  const [mode, setMode] = useState<Mode>("swipe");
  const [blinkB, setBlinkB] = useState(false);

  // blink flips on its own unless the viewer prefers reduced motion; then the tag button flips it
  useEffect(() => {
    if (mode !== "blink" || matchMedia(REDUCED).matches) return;
    const t = setInterval(() => setBlinkB((v) => !v), 700);
    return () => clearInterval(t);
  }, [mode]);
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
          <div className="d-seg" role="radiogroup" aria-label="How to compare">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} title={m.hint}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="d-radar">
          {mode === "swipe" && (
            <CompareSlider
              // eslint-disable-next-line @next/next/no-img-element -- generated radar preview
              before={<img src={src(a)} alt={`Radar image of the glacier front, ${fmtDay(a)}`} />}
              // eslint-disable-next-line @next/next/no-img-element -- generated radar preview
              after={<img src={src(b)} alt={`Radar image of the glacier front, ${fmtDay(b)}`} />}
              beforeLabel={fmtDay(a)}
              afterLabel={fmtDay(b)}
            />
          )}
          {mode === "diff" && (
            <figure className="d-diff" role="img" aria-label={`Change between ${fmtDay(a)} and ${fmtDay(b)}: bright areas changed, dark areas stayed the same`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated radar preview */}
              <img src={src(a)} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element -- generated radar preview */}
              <img src={src(b)} alt="" className="d-diff-top" />
              <span className="compare-tag compare-tag-l">
                {fmtDay(a)} vs {fmtDay(b)}
              </span>
            </figure>
          )}
          {mode === "blink" && (
            <figure className="d-blink">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated radar preview */}
              <img src={src(a)} alt={`Radar image of the glacier front, ${fmtDay(a)}`} hidden={blinkB} />
              {/* eslint-disable-next-line @next/next/no-img-element -- generated radar preview */}
              <img src={src(b)} alt={`Radar image of the glacier front, ${fmtDay(b)}`} hidden={!blinkB} />
              <button type="button" className="compare-tag compare-tag-l d-blink-tag" onClick={() => setBlinkB(!blinkB)}>
                Showing {fmtDay(blinkB ? b : a)}, click to flip
              </button>
            </figure>
          )}
        </div>
        <p className="d-foot-note">{MODES.find((m) => m.id === mode)!.hint}</p>
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
                  Track {p.track ?? "–"}, {directionLabel(p.direction).toLowerCase()}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
