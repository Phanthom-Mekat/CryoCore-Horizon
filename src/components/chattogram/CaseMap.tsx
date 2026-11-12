"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, ImageSource, Map as MlMap, MapMouseEvent } from "maplibre-gl";
import type { Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtTime } from "@/lib/chattogram/acquisitions";
import type { View } from "./CaseProvider";
import { stripeTile } from "@/lib/chattogram/palette";
import { FINDING } from "./MapKey";

export const BASEMAP = "https://tiles.openfreemap.org/styles/dark";

/** Orientation landmarks (approximate centres), labelled in our own style above the basemap. */
export const LANDMARKS: { name: string; lonLat: [number, number] }[] = [
  { name: "Chattogram", lonLat: [91.8317, 22.3569] },
  { name: "Cox’s Bazar", lonLat: [91.9794, 21.4272] },
  { name: "Feni", lonLat: [91.3976, 23.0159] },
  { name: "Noakhali", lonLat: [91.0995, 22.8696] },
  { name: "Sandwip", lonLat: [91.45, 22.5] },
  { name: "Hatiya", lonLat: [91.1, 22.35] },
  { name: "Maheshkhali", lonLat: [91.95, 21.55] },
  { name: "Kaptai Lake", lonLat: [92.2, 22.5] },
];

const REDUCED = "(prefers-reduced-motion: reduce)";
const ring = (r: [number, number][]) => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r);
/** Proxy URL for an acquisition's quicklook, or its corners (with the footprint extremes as a fallback source). */
export function browseUrl(a: Acquisition, part?: "bounds") {
  const q = `/api/nisar-browse?granule=${encodeURIComponent(a.granule)}&collection=${encodeURIComponent(a.collection)}`;
  if (!part) return q;
  const lons = a.footprint.map((p) => p[0]);
  const lats = a.footprint.map((p) => p[1]);
  return `${q}&part=bounds&fp=${[Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].join(",")}`;
}

type Props = {
  view: View;
  onMove?: (v: View) => void;
  /** The quicklook drawn on the map (null: none). */
  image: Acquisition | null;
  imageOpacity?: number;
  /** Footprints to outline; `selected` is drawn brighter. */
  footprints?: Acquisition[];
  selected?: string | null;
  onPick?: (conceptId: string | null) => void;
  /** Division outline (GeoJSON) from the backend. */
  boundary?: GeoJSON.FeatureCollection | null;
  label: string;
  /** Hands the map instance to a parent, e.g. to sync two maps in a swipe. */
  onReady?: (map: MlMap) => void;
  controls?: boolean;
  /** A processed raster (PNG with its four corners) drawn instead of the quicklook. */
  overlay?: Overlay | null;
  /** Processed areas of observed radar change (properties: id, kind increase|decrease). Drawn with colour + stripes. */
  findings?: GeoJSON.FeatureCollection | null;
  selectedFinding?: string | null;
  onFinding?: (id: string) => void;
  /** The analysis rectangle, outlined and named. */
  area?: GeoJSON.Feature | null;
  areaName?: string;
};

export type Overlay = { url: string; corners: [number, number][]; label: string };

export function CaseMap({
  view,
  onMove,
  image,
  imageOpacity = 0.9,
  footprints = [],
  selected = null,
  onPick,
  boundary = null,
  label,
  onReady,
  controls = true,
  overlay = null,
  findings = null,
  selectedFinding = null,
  onFinding,
  area = null,
  areaName = "Analysis area",
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // load state of the quicklook, keyed by acquisition so a new date reads as "loading" until its own result lands
  const [img, setImg] = useState<{ id: string; state: "shown" | "failed" } | null>(null);
  const imgId = overlay?.url ?? image?.conceptId ?? null;
  const imgState = !imgId ? "none" : img?.id === imgId ? img.state : "loading";
  const [hover, setHover] = useState<{ x: number; y: number; a: Acquisition } | null>(null);
  const latest = useRef({ onMove, onPick, footprints, onFinding });
  useEffect(() => {
    latest.current = { onMove, onPick, footprints, onFinding };
  });

  // create the map once
  useEffect(() => {
    let dead = false;
    import("maplibre-gl").then((ml) => {
      if (dead || !el.current) return;

      const reduced = matchMedia(REDUCED).matches;
      const m = new ml.Map({
        container: el.current,
        style: BASEMAP,
        center: [view.lon, view.lat],
        zoom: view.zoom,
        attributionControl: { compact: true },
        fadeDuration: reduced ? 0 : 200,
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      if (controls) {
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
      }
      // the basemap style names a few icons its sprite lacks; a blank one keeps the console clean
      m.on("styleimagemissing", (e: { id: string }) => {
        if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      m.on("error", (e) => {
        if (String(e.error?.message ?? "").includes("tiles.openfreemap.org")) setError("The basemap couldn’t load. The radar layers still work.");
      });
      m.on("load", () => {
        if (dead) return;
        m.addSource("boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "boundary-glow", type: "line", source: "boundary", paint: { "line-color": "#8fe3ff", "line-width": 6, "line-opacity": 0.12 } });
        m.addLayer({ id: "boundary", type: "line", source: "boundary", paint: { "line-color": "#8fe3ff", "line-width": 1.4, "line-opacity": 0.9 } });
        m.addSource("footprints", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
        m.addLayer({
          id: "footprints-fill",
          type: "fill",
          source: "footprints",
          paint: { "fill-color": "#e9f0f6", "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.08, 0] },
        });
        m.addLayer({
          id: "footprints",
          type: "line",
          source: "footprints",
          paint: {
            "line-color": ["case", ["boolean", ["get", "selected"], false], "#ffb454", "#3987e5"],
            "line-width": ["case", ["boolean", ["get", "selected"], false], 2.2, 1],
            "line-opacity": ["case", ["boolean", ["get", "selected"], false], 1, 0.55],
          },
        });
        // the analysis rectangle: dashed outline, its name along the edge
        m.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "area", type: "line", source: "area", paint: { "line-color": "#f3eee5", "line-width": 1.6, "line-dasharray": [3, 2] } });
        m.addLayer({
          id: "area-name",
          type: "symbol",
          source: "area",
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "symbol-placement": "line", "text-offset": [0, -0.8] },
          paint: { "text-color": "#f3eee5", "text-halo-color": "#070b12", "text-halo-width": 1.6 },
        });
        // processed areas of observed radar change: the diverging scale's poles (signed change, never the water
        // colours), each with its own stripe direction; the selected one is outlined in white
        for (const [id, w] of Object.entries(FINDING)) m.addImage(`stripe-${id}`, stripeTile(w.color, w.stripe));
        m.addSource("findings", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
        m.addLayer({ id: "findings-pattern", type: "fill", source: "findings", paint: { "fill-pattern": ["concat", "stripe-", ["get", "kind"]] } });
        m.addLayer({
          id: "findings-halo",
          type: "line",
          source: "findings",
          paint: { "line-color": "#070b12", "line-width": ["case", ["boolean", ["get", "selected"], false], 6, 3], "line-opacity": 0.8 },
        });
        m.addLayer({
          id: "findings-line",
          type: "line",
          source: "findings",
          paint: {
            "line-color": ["case", ["boolean", ["get", "selected"], false], "#f3eee5", ["match", ["get", "kind"], "increase", FINDING.increase.color, "decrease", FINDING.decrease.color, "#f3eee5"]],
            "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 1.4],
          },
        });
        m.on("click", "findings-pattern", (e: MapMouseEvent & { features?: { properties?: { id?: string } }[] }) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) latest.current.onFinding?.(id);
        });
        m.on("mouseenter", "findings-pattern", () => {
          if (latest.current.onFinding) m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", "findings-pattern", () => {
          m.getCanvas().style.cursor = "";
        });
        m.addSource("landmarks", {
          type: "geojson",
          data: { type: "FeatureCollection", features: LANDMARKS.map((l) => ({ type: "Feature", properties: { name: l.name }, geometry: { type: "Point", coordinates: l.lonLat } })) },
        });
        m.addLayer({ id: "landmark-dots", type: "circle", source: "landmarks", paint: { "circle-radius": 3, "circle-color": "#f3eee5", "circle-stroke-color": "#070b12", "circle-stroke-width": 1.5 } });
        m.addLayer({
          id: "landmark-names",
          type: "symbol",
          source: "landmarks",
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-offset": [0, 1.1], "text-anchor": "top" },
          paint: { "text-color": "#f3eee5", "text-halo-color": "#070b12", "text-halo-width": 1.6 },
        });
        let hovered: string | number | undefined;
        m.on("mousemove", "footprints-fill", (e: MapMouseEvent & { features?: { id?: string | number }[] }) => {
          const id = e.features?.[0]?.id;
          if (hovered !== undefined) m.setFeatureState({ source: "footprints", id: hovered }, { hover: false });
          hovered = id;
          if (id !== undefined) m.setFeatureState({ source: "footprints", id }, { hover: true });
          const a = latest.current.footprints.find((f) => f.conceptId === id);
          setHover(a ? { x: e.point.x, y: e.point.y, a } : null);
          m.getCanvas().style.cursor = latest.current.onPick ? "pointer" : "";
        });
        m.on("mouseleave", "footprints-fill", () => {
          if (hovered !== undefined) m.setFeatureState({ source: "footprints", id: hovered }, { hover: false });
          hovered = undefined;
          setHover(null);
          m.getCanvas().style.cursor = "";
        });
        m.on("click", "footprints-fill", (e: MapMouseEvent & { features?: { id?: string | number }[] }) => {
          // a click on a finding is about the finding, not the acquisition under it
          if (latest.current.onFinding && m.queryRenderedFeatures(e.point, { layers: ["findings-pattern"] }).length) return;
          latest.current.onPick?.(String(e.features?.[0]?.id ?? "") || null);
        });
        // only the viewer's own pans and zooms are saved; loads, resizes and syncing from another map are not
        m.on("moveend", (e: { originalEvent?: Event }) => {
          if (!e.originalEvent) return;
          const c = m.getCenter();
          latest.current.onMove?.({ lon: c.lng, lat: c.lat, zoom: m.getZoom() });
        });
        map.current = m;
        setReady(true);
        onReady?.(m);
      });
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // created once; later view changes are applied by the effect below
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the shared view (another map, a link, the timeline) without fighting the user's own pan
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (Math.abs(c.lng - view.lon) > 1e-4 || Math.abs(c.lat - view.lat) > 1e-4 || Math.abs(m.getZoom() - view.zoom) > 0.01) m.jumpTo({ center: [view.lon, view.lat], zoom: view.zoom });
  }, [view.lon, view.lat, view.zoom, ready]);

  useEffect(() => {
    const src = map.current?.getSource("findings") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: (findings?.features ?? []).map((f) => ({ ...f, properties: { ...f.properties, selected: f.properties?.id === selectedFinding } })),
    });
  }, [findings, selectedFinding, ready]);

  useEffect(() => {
    const src = map.current?.getSource("area") as GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: area ? [{ ...area, properties: { ...area.properties, name: areaName } }] : [] });
  }, [area, areaName, ready]);

  useEffect(() => {
    const src = map.current?.getSource("boundary") as GeoJSONSource | undefined;
    src?.setData(boundary ?? { type: "FeatureCollection", features: [] });
  }, [boundary, ready]);

  useEffect(() => {
    const src = map.current?.getSource("footprints") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: footprints.map((a) => ({
        type: "Feature",
        id: a.conceptId,
        properties: { id: a.conceptId, selected: a.conceptId === selected },
        geometry: { type: "Polygon", coordinates: [ring(a.footprint)] },
      })),
    });
  }, [footprints, selected, ready]);

  // the raster: a processed overlay as given, or a quicklook whose corners are fetched first; either way the image
  // source is swapped in place (no flash between dates)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!overlay && !image) {
      if (m.getLayer("browse")) m.removeLayer("browse");
      if (m.getSource("browse")) m.removeSource("browse");
      return;
    }
    let live = true;
    const id = overlay?.url ?? image!.conceptId;
    const placed: Promise<{ url: string; corners: [[number, number], [number, number], [number, number], [number, number]] }> = overlay
      ? Promise.resolve({ url: overlay.url, corners: overlay.corners as [[number, number], [number, number], [number, number], [number, number]] })
      : fetch(browseUrl(image!, "bounds"))
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then(({ corners }) => ({ url: browseUrl(image!), corners }));
    placed
      .then(({ url, corners }) => {
        if (!live) return;
        const src = m.getSource("browse") as ImageSource | undefined;
        if (src) src.updateImage({ url, coordinates: corners });
        else {
          m.addSource("browse", { type: "image", url, coordinates: corners });
          m.addLayer(
            { id: "browse", type: "raster", source: "browse", paint: { "raster-opacity": imageOpacity, "raster-fade-duration": 0, "raster-resampling": "linear" } },
            "boundary-glow",
          );
        }
        m.once("idle", () => live && setImg({ id, state: "shown" }));
      })
      .catch(() => live && setImg({ id, state: "failed" }));
    return () => {
      live = false;
    };
  }, [image, overlay?.url, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (m?.getLayer("browse")) m.setPaintProperty("browse", "raster-opacity", imageOpacity);
  }, [imageOpacity, ready]);

  return (
    <div className="c-map" aria-label={label} role="region">
      <div ref={el} className="c-map-canvas" />
      {hover && (
        <div className="c-map-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <strong>{fmtDate(hover.a.start)}</strong>
          <span>
            {fmtTime(hover.a.start)} · track {hover.a.track}, frame {hover.a.frame}
          </span>
          <span>
            {hover.a.direction} · {hover.a.polarizations.join("+")}
          </span>
        </div>
      )}
      {imgState === "loading" && <p className="c-map-note">{overlay ? `Loading ${overlay.label}…` : "Loading the NISAR quicklook from ASF…"}</p>}
      {imgState === "failed" && (
        <p className="c-map-note is-bad">
          {overlay ? `${overlay.label}: the image couldn’t be loaded from the backend.` : "The quicklook for this date couldn’t be loaded from ASF. Footprints and dates are still accurate."}
        </p>
      )}
      {error && <p className="c-map-note is-bad">{error}</p>}
    </div>
  );
}
