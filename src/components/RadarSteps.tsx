"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

const STEPS = [
  {
    title: "Send a pulse",
    meta: "L-BAND 24 CM · S-BAND 10 CM",
    body: "From 747 km up, NISAR fires microwave pulses down and to one side. NASA's L-band radar uses a 24 cm wavelength, and ISRO's S-band uses 10 cm. Neither needs sunlight, and both pass through cloud.",
  },
  {
    title: "Listen for the echo",
    meta: "BACKSCATTER σ⁰",
    body: "Rough, crevassed ice throws a lot of the signal back and looks bright. Smooth water and wet snow send it away and look dark. The echo carries the surface's roughness and moisture.",
  },
  {
    title: "Build a sharp image",
    meta: "SYNTHETIC APERTURE",
    body: "As the satellite moves, it combines thousands of echoes as if they came from one antenna many kilometres long. That synthetic aperture resolves features a few metres across.",
  },
  {
    title: "Compare passes",
    meta: "12-DAY BASELINE",
    body: "Twelve days later NISAR images the same ice again. Matching the speckle pattern between the two images shows how far each patch of the glacier moved.",
  },
];

export function RadarSteps() {
  const [step, setStep] = useState(1);
  const uid = useId();
  const coneId = `${uid}-cone`;
  const speckleId = `${uid}-speckle`;
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeStep = STEPS[step - 1];

  const onStepKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowDown") nextIdx = (index + 1) % STEPS.length;
    else if (e.key === "ArrowUp") nextIdx = (index - 1 + STEPS.length) % STEPS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = STEPS.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    setStep(nextIdx + 1);
    btnRefs.current[nextIdx]?.focus();
  };

  return (
    <div className="radar" data-step={step}>
      <ol className="radar-list">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const panelId = `${uid}-step-${n}`;
          return (
            <li key={s.title}>
              <button
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                aria-expanded={step === n}
                aria-controls={panelId}
                onClick={() => setStep(n)}
                onKeyDown={(e) => onStepKeyDown(e, i)}
              >
                <span className="radar-num">{String(n).padStart(2, "0")}</span>
                <span className="radar-step-copy">
                  <span className="radar-title">{s.title}</span>
                  <span className="radar-meta">{s.meta}</span>
                </span>
              </button>
              <p id={panelId} hidden={step !== n}>{s.body}</p>
            </li>
          );
        })}
      </ol>

      <div className="radar-stage">
        <div className="radar-bar" aria-hidden="true">
          <span className="radar-bar-step">STEP {String(step).padStart(2, "0")} / 04</span>
          <span className="radar-bar-title">{activeStep.title}</span>
        </div>
        <svg className="radar-svg" viewBox="0 0 600 380" role="img" aria-label={`Diagram, step ${step}: ${activeStep.title}`}>
          <defs>
            <clipPath id={coneId}>
              <polygon points="150,62 215,300 440,300" />
            </clipPath>
            <filter id={speckleId} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
              <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.75  0 0 0 0 0.9  0 0 0 1.4 -0.35" />
            </filter>
          </defs>

          {/* subtle range grid */}
          {[90, 150, 210, 270].map((gy) => (
            <line key={`hy-${gy}`} className="rs-grid" x1="0" x2="600" y1={gy} y2={gy} />
          ))}
          {[120, 240, 360, 480].map((gx) => (
            <line key={`vx-${gx}`} className="rs-grid" x1={gx} x2={gx} y1="0" y2="300" />
          ))}

          {/* ground: crevassed ice, then open water */}
          <path className="rs-ice" d="M0 300 H40 l6 14 6-14 H96 l5 18 5-18 H150 l7 12 7-12 H214 l5 16 5-16 H262 l6 13 6-13 H330 l5 15 5-15 H380 V380 H0Z" />
          <path className="rs-water" d="M380 306 H600 V380 H380Z" />
          <text className="rs-small" x="16" y="352">Crevassed ice</text>
          <text className="rs-small" x="396" y="352">Open water</text>

          {/* satellite with its 12 m mesh reflector */}
          <g className="rs-sat">
            <line x1="150" y1="60" x2="182" y2="46" />
            <ellipse cx="192" cy="42" rx="20" ry="7" transform="rotate(-25 192 42)" />
            <rect x="138" y="52" width="24" height="16" rx="2" />
            <rect className="rs-panel" x="96" y="56" width="38" height="8" />
            <rect className="rs-panel" x="166" y="56" width="38" height="8" />
          </g>

          <g className="rs-g rs-g1" clipPath={`url(#${coneId})`}>
            <polygon className="rs-cone" points="150,62 215,300 440,300" />
            {[0, 1, 2].map((i) => (
              <circle key={i} className="wave" cx="150" cy="62" r="60" style={{ animationDelay: `${i * 0.8}s` }} />
            ))}
          </g>

          <g className="rs-g rs-g2">
            <line className="rs-incident" x1="150" y1="70" x2="221" y2="306" />
            <line className="rs-incident" x1="150" y1="70" x2="420" y2="306" />
            {[103, 157, 221, 269, 337].map((x) => (
              <line key={x} className="echo" x1={x} y1="306" x2={150 + (x - 150) * 0.35} y2="150" />
            ))}
            {[46, 101, 157, 219, 268, 335].map((cx) => (
              <circle key={cx} className="rs-glint" cx={cx} cy="303" r="3" />
            ))}
            <line className="echo-weak" x1="420" y1="306" x2="560" y2="200" />
            <line className="echo-weak" x1="452" y1="306" x2="576" y2="212" />
            <path className="echo-weak-head" d="M551 200 L561 199 L557 209" />
            <text className="rs-small" x="232" y="214">Strong echo</text>
            <text className="rs-small" x="448" y="238">Bounces away</text>
          </g>

          <g className="rs-g rs-g3">
            <line className="rs-track" x1="40" y1="60" x2="300" y2="60" />
            {[60, 240].map((x) => (
              <rect key={x} className="rs-ghost" x={x - 12} y="52" width="24" height="16" rx="2" />
            ))}
            {[84, 108, 130, 174, 198, 218].map((x) => (
              <line key={x} className="rs-fan" x1="250" y1="300" x2={x} y2="72" />
            ))}
            {[60, 150, 240].map((x) => (
              <line key={x} className="echo" x1="250" y1="300" x2={x} y2="70" />
            ))}
            <circle className="rs-target" cx="250" cy="300" r="6" />
            <path className="rs-bracket" d="M48 34 V28 H252 V34" />
            <text className="rs-small" x="70" y="20">One long synthetic antenna</text>
          </g>

          <g className="rs-g rs-g4">
            {[
              { x: 330, label: "Day 0", dx: 0 },
              { x: 470, label: "Day 12", dx: -22 },
            ].map((t) => (
              <g key={t.label}>
                <rect x={t.x} y="40" width="120" height="110" rx="3" filter={`url(#${speckleId})`} />
                <rect className="rs-frame" x={t.x} y="40" width="120" height="110" rx="3" />
                <path
                  className="rs-corner"
                  d={`M${t.x} 50 V40 H${t.x + 10} M${t.x + 110} 40 H${t.x + 120} V50 M${t.x} 140 V150 H${t.x + 10} M${t.x + 110} 150 H${t.x + 120} V140`}
                />
                <path className="rs-feature" transform={`translate(${t.x + 70 + t.dx} 80)`} d="M0 0 l8 10 -4 12 10 8 M14 -4 l6 14 -2 10" />
                <text className="rs-small" x={t.x} y="168">{t.label}</text>
              </g>
            ))}
            <path className="rs-move" d="M572 180 H520 m8 -6 l-8 6 8 6" />
            <text className="rs-mono rs-delta" x="330" y="185">Δx ≈ 480 m / 12 d</text>
            <text className="rs-small" x="330" y="210">
              <tspan x="330" dy="0">Same crevasses,</tspan>
              <tspan x="330" dy="1.3em">up to ~480 m further on</tspan>
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
