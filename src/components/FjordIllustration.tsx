/**
 * Stylised radar-style view of the Jakobshavn front: bright crevassed ice, dark open water,
 * speckled iceberg mélange. A stand-in until real NISAR images replace it. Not data.
 */
const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

const SHARD_TONES = ["#eef4f8", "#d6e2ea", "#b4c7d5", "#96adbd"] as const;
const FLOW_LANES = [-3, -2, -1, 0, 1, 2, 3] as const;
const SHEAR_SAMPLES = [0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74] as const;

export function FjordIllustration({ id, front, flow }: { id: string; front: number; flow: number }) {
  const f = front;
  const bergs = Array.from({ length: 140 }, (_, i) => {
    const u = ((i * 73 + 19) % 140) / 140;
    const t = 0.02 + 0.94 * (1 - Math.pow(1 - u, 1.35));
    const cx = bez(0, 150, 300, f, t);
    const yTop = bez(200, 208, 218, 226, t);
    const half = 250 - yTop; // fjord widens toward the sea
    const w = 1.8 + ((i * 7) % 5) * 1.2;
    const h = 1.2 + ((i * 11) % 4) * 0.85;
    const r = Math.hypot(w / 2, h / 2);
    const v = (((i * 97 + 31) % 199) / 199) * 2 - 1;
    const cy = 250 + v * Math.max(half - r - 3, 1);
    const rot = ((i * 53) % 150) - 75;
    return {
      cx,
      cy,
      w,
      h,
      rot,
      fill: SHARD_TONES[i % SHARD_TONES.length],
      o: 0.4 + ((i * 13) % 6) * 0.09,
    };
  });

  // transverse crevasses: anchored in ice coordinates and advected downstream (−flow) toward the fjord
  const arcs = Array.from({ length: 16 }, (_, k) => 448 + k * 26 - flow);
  const shearTicks = SHEAR_SAMPLES.map((s) => ({
    x: bez(f, f + 60, f + 160, f + 240, s),
    y: bez(226, 196, 60, 0, s) + 12,
  }));

  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a glacier front in a fjord, styled like a radar image">
      <defs>
        <filter id={`sp-${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed={id === "a" ? 3 : 9} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <linearGradient id={`ice-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#c5d4df" />
          <stop offset="0.55" stopColor="#8fa2b2" />
          <stop offset="1" stopColor="#637789" />
        </linearGradient>
        <clipPath id={`tongue-${id}`}>
          <path d={`M${f} 226 C${f + 60} 196 ${f + 160} 60 ${f + 240} 0 H800 V500 H${f + 240} C${f + 160} 440 ${f + 60} 304 ${f} 274 Z`} />
        </clipPath>
      </defs>

      {/* bedrock base + radar-foreshortened fjord cliffs */}
      <rect width="800" height="500" fill="#25303b" />
      <g aria-hidden="true">
        {/* North terrain facets & ridges */}
        <path d="M0 0 H690 L600 95 L455 170 L320 205 L160 198 L0 192 Z" fill="#2e3b48" />
        <path d="M0 32 L135 58 L240 24 L375 92 L505 46 L615 0 H450 L365 68 L235 128 L120 156 L0 144 Z" fill="#3b4c5c" opacity="0.88" />
        <path d="M180 148 L295 104 L418 142 L475 215 L320 226 L160 212 Z" fill="#46586a" opacity="0.72" />
        <path d="M85 0 L155 82 L120 165 L190 120 L255 0 Z" fill="#1b242e" opacity="0.75" />
        <path d="M350 0 L415 76 L368 152 L448 118 L510 0 Z" fill="#19222c" opacity="0.7" />
        <path d="M0 78 Q120 92 225 46 T435 72 T605 28" stroke="#7f96aa" strokeWidth="0.9" fill="none" opacity="0.28" />
        <path d="M0 132 Q145 148 275 112 T455 148" stroke="#7f96aa" strokeWidth="0.85" fill="none" opacity="0.24" />
        <path d="M18 176 Q190 190 385 204" stroke="#8fa6ba" strokeWidth="0.8" fill="none" opacity="0.22" />

        {/* South terrain facets & ridges */}
        <path d="M0 308 L160 302 L320 295 L455 330 L600 405 L690 500 H0 Z" fill="#2c3946" />
        <path d="M0 356 L128 332 L248 378 L368 336 L478 395 L610 500 H440 L345 424 L218 446 L95 415 L0 438 Z" fill="#3a4b5b" opacity="0.85" />
        <path d="M165 288 L325 276 L468 292 L412 356 L278 386 L152 344 Z" fill="#47596b" opacity="0.68" />
        <path d="M92 500 L158 418 L112 336 L194 388 L252 500 Z" fill="#1a232d" opacity="0.72" />
        <path d="M358 500 L422 420 L372 344 L460 392 L528 500 Z" fill="#18212b" opacity="0.68" />
        <path d="M0 422 Q130 408 240 448 T450 426 T610 474" stroke="#7f96aa" strokeWidth="0.9" fill="none" opacity="0.26" />
        <path d="M0 368 Q150 352 288 386 T465 350" stroke="#7f96aa" strokeWidth="0.85" fill="none" opacity="0.22" />
        <path d="M18 324 Q190 310 385 296" stroke="#8fa6ba" strokeWidth="0.8" fill="none" opacity="0.22" />
      </g>

      {/* fjord water & iceberg mélange strictly inside water polygon */}
      <path d={`M0 200 C150 208 300 218 ${f} 226 V274 C300 282 150 292 0 300 Z`} fill="#0a1219" />
      <g className="fjord-melange">
        {bergs.map((b, i) => (
          <rect
            key={i}
            x={b.cx - b.w / 2}
            y={b.cy - b.h / 2}
            width={b.w}
            height={b.h}
            fill={b.fill}
            opacity={b.o}
            transform={`rotate(${b.rot} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)})`}
          />
        ))}
      </g>

      {/* glacier tongue: flowlines, shear margins, and transverse crevasses */}
      <g clipPath={`url(#tongue-${id})`}>
        <rect width="800" height="500" fill={`url(#ice-${id})`} />
        {FLOW_LANES.map((lane) => (
          <path
            key={`fl-${lane}`}
            d={
              lane === 0
                ? `M805 250 H${f - 10}`
                : `M805 ${250 + lane * 62} C${f + 220} ${250 + lane * 44} ${f + 100} ${250 + lane * 14} ${f - 10} ${250 + lane * 7}`
            }
            stroke="#cde0ec"
            strokeWidth="0.95"
            strokeDasharray="12 7"
            fill="none"
            opacity="0.24"
          />
        ))}
        {shearTicks.map((pt, k) => (
          <g key={`sh-${k}`}>
            <path d={`M${(pt.x - 7).toFixed(1)} ${(pt.y + 8).toFixed(1)} l14 -12`} stroke="#dfeaf2" strokeWidth="1.2" fill="none" opacity="0.48" />
            <path d={`M${(pt.x - 5).toFixed(1)} ${(pt.y + 10).toFixed(1)} l14 -12`} stroke="#1e2933" strokeWidth="1" fill="none" opacity="0.42" />
            <path d={`M${(pt.x - 7).toFixed(1)} ${(500 - pt.y - 8).toFixed(1)} l14 12`} stroke="#dfeaf2" strokeWidth="1.2" fill="none" opacity="0.48" />
            <path d={`M${(pt.x - 5).toFixed(1)} ${(500 - pt.y - 10).toFixed(1)} l14 12`} stroke="#1e2933" strokeWidth="1" fill="none" opacity="0.42" />
          </g>
        ))}
        {arcs.map((x, k) => (
          <path key={k} d={`M${x + 30} 0 Q${x - 10} 250 ${x + 30} 500`} stroke="#eef4f8" strokeWidth={k % 3 === 0 ? 2.2 : 1.2} fill="none" opacity="0.55" />
        ))}
        {arcs.map((x, k) => (
          <path key={`d${k}`} d={`M${x + 42} 0 Q${x + 2} 250 ${x + 42} 500`} stroke="#25313b" strokeWidth="1.4" fill="none" opacity="0.5" />
        ))}
      </g>

      {/* calving cliff highlight */}
      <path d={`M${f} 226 l5 7 -4 6 6 8 -5 7 4 8 -6 9 -2 3`} stroke="#8fe3ff" strokeWidth="4.5" fill="none" opacity="0.3" />
      <path d={`M${f + 2} 226 l5 7 -4 6 6 8 -5 7 4 8 -6 9 -2 3`} stroke="#16222c" strokeWidth="1.6" fill="none" opacity="0.65" />
      <path d={`M${f} 226 l5 7 -4 6 6 8 -5 7 4 8 -6 9 -2 3`} stroke="#fff" strokeWidth="2" fill="none" />

      {/* SAR speckle texture */}
      <rect width="800" height="500" filter={`url(#sp-${id})`} opacity="0.36" style={{ mixBlendMode: "multiply" }} />

      {/* scale bar & synthetic corner tag */}
      <g className="fjord-meta" aria-hidden="true">
        <rect x="14" y="458" width="96" height="28" rx="2" fill="#04080f" fillOpacity="0.72" stroke="#a0c8e6" strokeOpacity="0.22" />
        <path d="M24 468 V474 H68 V468" stroke="#e9f0f6" strokeWidth="1.5" fill="none" />
        <text x="75" y="476" fill="#e9f0f6" fontSize="11" fontFamily="var(--mono)">2 km</text>
        <rect x="598" y="458" width="188" height="28" rx="2" fill="#04080f" fillOpacity="0.72" stroke="#a0c8e6" strokeOpacity="0.22" />
        <text x="776" y="476" textAnchor="end" fill="#93a9bd" fontSize="10.5" fontFamily="var(--mono)">Illustration · synthetic SAR</text>
      </g>
    </svg>
  );
}
