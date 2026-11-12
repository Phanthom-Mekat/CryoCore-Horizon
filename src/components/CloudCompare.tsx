"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { CompareSlider } from "@/components/CompareSlider";

export type CloudPair = { key: string; day: string; radarTime: string; radar: string; optical: string };

const SIZES = "(max-width: 900px) 100vw, 720px";

/** Same-morning MODIS photo vs NISAR radar for each pass in the case stack. Both images share one lat/lon grid. */
export function CloudCompare({ pairs, aspect, initial, track, frame }: { pairs: CloudPair[]; aspect: number; initial: number; track: number; frame: number }) {
  const [i, setI] = useState(initial);
  const p = pairs[i];
  return (
    <div className="clouds" style={{ "--aspect": aspect } as CSSProperties}>
      <figure>
        <CompareSlider
          before={<Image src={p.optical} alt="" fill sizes={SIZES} />}
          after={<Image src={p.radar} alt="" fill sizes={SIZES} />}
          beforeLabel={`Camera, ${p.day}`}
          afterLabel={`Radar, ${p.day}`}
        />
        <figcaption className="note">
          Left: MODIS Terra true-colour photo, {p.day}, about 10:30. Right: NISAR radar from the same morning at {p.radarTime}, track {track},
          frame {frame}. Black wedges are gaps between MODIS orbits. The radar picture is a quick-look browse image, not calibrated backscatter.
        </figcaption>
      </figure>
      <div className="clouds-pick">
        <p className="clouds-pick-label" id="clouds-pick">
          Pick a pass
        </p>
        <div className="clouds-dates" role="group" aria-labelledby="clouds-pick">
          {pairs.map((x, j) => (
            <button key={x.key} type="button" aria-pressed={j === i} onClick={() => setI(j)}>
              {x.day}
            </button>
          ))}
        </div>
        <p className="clouds-hint">Drag the line across the picture to swap between camera and radar.</p>
      </div>
    </div>
  );
}
