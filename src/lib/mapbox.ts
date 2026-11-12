import type { Map, StyleSpecification } from "mapbox-gl";

// Mapbox publishes equivalent ESM/UMD APIs with separately declared private types.
// Normalize that boundary for react-map-gl, whose declarations use the UMD type entry.
export const loadMapbox = () => import("mapbox-gl/esm") as unknown as Promise<typeof import("mapbox-gl")>;

// Intentionally public: Mapbox browser tokens should have URL restrictions and no secret scopes.
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
export const MAPBOX_CONFIGURED = MAPBOX_TOKEN.startsWith("pk.");

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    imports: [{ id: "basemap", url: "mapbox://styles/mapbox/standard", config: {
      lightPreset: typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "night" : "day",
      showPointOfInterestLabels: false,
    } }],
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sources: {}, layers: [],
  };
}

/** Change lighting without reloading the style or losing custom scientific layers. */
export function followMapTheme(map: Map) {
  const update = () => {
    if (map.isStyleLoaded()) map.setConfigProperty("basemap", "lightPreset", document.documentElement.dataset.theme === "dark" ? "night" : "day");
    else map.once("idle", update);
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  map.on("style.load", update);
  update();
  return () => { observer.disconnect(); map.off("style.load", update); map.off("idle", update); };
}

export const cameraDuration = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;

export function mapError(message: string) {
  if (/401|403|token|unauthorized|forbidden/i.test(message)) return "Mapbox access was denied. Check the map token and its allowed URLs.";
  if (/webgl|context/i.test(message)) return "Interactive maps need WebGL support. Try a browser with hardware acceleration enabled.";
  return "Some map resources could not load. Check your connection; scene details remain available.";
}
