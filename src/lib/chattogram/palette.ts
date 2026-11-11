// Colours for processed results, validated with the dataviz palette checker on the dark map surface (#0b1220):
// - water categories: cyan / amber, CVD ΔE ≥ 19 against each other, each also carries its own stripe direction;
// - signed backscatter change: magenta (darker) → grey → green (brighter), its own diverging scale.
// Green and amber are close for protan vision (ΔE 4), so the two encodings are never drawn at the same time:
// the map shows categories OR the change field, each with its own legend.

export const WATER = {
  new_water_candidate: { label: "New water candidate", color: "#199bbd", stripe: 45, icon: "▲" },
  recession_candidate: { label: "Receding water candidate", color: "#cf7f1a", stripe: 135, icon: "▼" },
} as const;
export type WaterCategory = keyof typeof WATER;

export const CHANGE = { neg: "#c2509a", mid: "#8a8f98", pos: "#4f9a4a", limitDb: 6 } as const;

/** Signed backscatter change (dB) → colour, clamped to ±limitDb, neutral grey at 0. */
export function changeColor(db: number) {
  const t = Math.max(-1, Math.min(1, db / CHANGE.limitDb));
  const mix = (a: string, b: string, k: number) => {
    const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(" ")})`;
  };
  return t < 0 ? mix(CHANGE.mid, CHANGE.neg, -t) : mix(CHANGE.mid, CHANGE.pos, t);
}

/** A small diagonal-stripe tile for MapLibre fill-pattern, so categories never rely on colour alone. */
export function stripeTile(color: string, angle: 45 | 135, size = 12) {
  const data = new Uint8Array(size * size * 4);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = angle === 45 ? (x + y) % size : (x - y + size) % size;
      const on = d < 3;
      data.set(on ? [r, g, b, 235] : [r, g, b, 70], (y * size + x) * 4);
    }
  return { width: size, height: size, data };
}
