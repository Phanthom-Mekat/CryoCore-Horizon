/** Versioned, validated links for a published radar case, separate from browse selection. */
export type RadarMode = "before" | "after" | "change" | "swipe";
export type RadarState = {
  caseId: string | null;
  mode: RadarMode;
  polarization: "HHHH" | "HVHV";
  opacity: number;
  split: number;
  view: { lon: number; lat: number; zoom: number };
  point: [number, number] | null;
};
export function parseRadarState(params: URLSearchParams): RadarState {
  const bounded = (text: string | null | undefined, min: number, max: number, fallback: number) => {
    const n = text?.trim() ? Number(text) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const pos = params.get("rv")?.split(",") ?? [];
  const point = params.get("rp")?.split(",") ?? [];
  const lon = bounded(point[0], -180, 180, NaN), lat = bounded(point[1], -85, 85, NaN);
  const mode = params.get("layer");
  return {
    caseId: params.get("case"),
    mode: ["before", "after", "change", "swipe"].includes(mode ?? "") ? mode as RadarMode : "change",
    polarization: params.get("pol") === "HVHV" ? "HVHV" : "HHHH",
    opacity: bounded(params.get("opacity"), 0, 1, 0.85),
    split: bounded(params.get("split"), 0, 100, 50),
    view: { lon: bounded(pos[0], -180, 180, 91.845), lat: bounded(pos[1], -85, 85, 22.33), zoom: bounded(pos[2], 0, 22, 13) },
    point: point.length === 2 && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null,
  };
}

export function radarQuery(state: RadarState): string {
  if (!state.caseId || !/^[a-f0-9]{24}$/.test(state.caseId)) throw new Error("A published case is required.");
  const params = new URLSearchParams({ case: state.caseId, layer: state.mode, pol: state.polarization,
    opacity: String(state.opacity), split: String(state.split),
    rv: [state.view.lon, state.view.lat, state.view.zoom].join(",") });
  // Preserve pixel coordinates exactly: rounding can move a point across a 20 m boundary.
  if (state.point) params.set("rp", state.point.join(","));
  return params.toString();
}
