"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, ImageSource, Map as MlMap, MapMouseEvent } from "mapbox-gl";
import type { Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum, fmtTime } from "@/lib/i18n/format";
import { useLang, useT } from "@/lib/i18n/useT";
import { useCase, type View } from "./CaseProvider";
import { WATER, stripeTile } from "@/lib/chattogram/palette";

import { loadMapbox, MAPBOX_CONFIGURED, MAPBOX_TOKEN, mapStyle, followMapTheme, mapError, cameraDuration } from "@/lib/mapbox";
import { MapUnavailable } from "@/components/maps/MapUnavailable";
import type { ProcessedImage } from "@/lib/chattogram/processed";

/**
 * Orientation landmarks (approximate centres), labelled in our own style above the basemap. The names are HTML labels,
 * not a map text layer: WebGL map text can't shape Bengali conjuncts, the browser can.
 */
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
/** Writes each landmark label in the interface language (labels keep their English key in data-name), shown or not. */
function nameLandmarks(labels: HTMLSpanElement[], names: Record<string, string>, shown: boolean) {
  for (const label of labels) {
    label.textContent = names[label.dataset.name ?? ""] ?? label.dataset.name ?? "";
    label.hidden = !shown;
  }
}
const ring = (r: [number, number][]) => (r.length && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1]) ? [...r, r[0]] : r);
/** Where to load an acquisition's quicklook: the frozen case's static file when it has one, else the live proxy. */
export const quicklookSrc = (a: Acquisition) => a.frozen?.src ?? browseUrl(a);

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
  processed?: ProcessedImage | null;
  allowTerrain?: boolean;
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
  /** Processed water-change candidates from the backend (GeoJSON, properties: id, category). Drawn with colour + stripes. */
  findings?: GeoJSON.FeatureCollection | null;
  selectedFinding?: string | null;
};

export function CaseMap({
  view,
  onMove,
  image,
  processed = null,
  allowTerrain = true,
  imageOpacity = 0.9,
  footprints = [],
  selected = null,
  onPick,
  boundary = null,
  label,
  onReady,
  controls = true,
  findings = null,
  selectedFinding = null,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const initialView = useRef(view);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [terrain, setTerrain] = useState(false);
  const [rasterError, setRasterError] = useState<string | null>(null);
  const [rasterShown, setRasterShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // load state of the quicklook, keyed by acquisition so a new date reads as "loading" until its own result lands
  const { source } = useCase();
  const replaying = source.mode === "frozen";
  const [img, setImg] = useState<{ id: string; state: "shown" | "failed" | "absent" } | null>(null);
  const imgState = !image ? "none" : img?.id === image.conceptId ? img.state : "loading";
  const [hover, setHover] = useState<{ x: number; y: number; a: Acquisition } | null>(null);
  const t = useT();
  const lang = useLang();
  const landmarkEls = useRef<HTMLSpanElement[]>([]);
  const latest = useRef({ onMove, onPick, footprints });
  useEffect(() => {
    latest.current = { onMove, onPick, footprints };
  });

  // create the map once
  useEffect(() => {
    if (!MAPBOX_CONFIGURED) return;
    let dead = false;
    let disposeTheme: (() => void) | undefined;
    loadMapbox().then((ml) => {
      if (dead || !el.current) return;

      const reduced = matchMedia(REDUCED).matches;
      const m = new ml.Map({
        container: el.current,
        style: mapStyle(),
        accessToken: MAPBOX_TOKEN,
        projection: "mercator",
        center: [view.lon, view.lat],
        zoom: view.zoom,
        attributionControl: false,
        fadeDuration: reduced ? 0 : 200,
        dragRotate: true,
        pitchWithRotate: true,
      });
      m.addControl(new ml.AttributionControl({ compact: true }));
      map.current = m;
      disposeTheme = followMapTheme(m);
      m.touchZoomRotate.disableRotation();
      if (controls) {
        m.addControl(new ml.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
        m.addControl(new ml.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
      }
      m.on("error", (e) => {
        if (!dead) setError(mapError(String(e.error?.message ?? "")));
      });
      m.on("load", () => {
        if (dead) return;
        m.addSource("terrain-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
        m.addSource("boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "boundary-glow", type: "line", source: "boundary", paint: { "line-color": "#1686b0", "line-width": 6, "line-opacity": 0.12 } });
        m.addLayer({ id: "boundary", type: "line", source: "boundary", paint: { "line-color": "#1686b0", "line-width": 1.4, "line-opacity": 0.9 } });
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
        // processed water-change candidates: category colour, its own stripe direction, outline brighter when selected
        for (const [id, w] of Object.entries(WATER)) m.addImage(`stripe-${id}`, stripeTile(w.color, w.stripe));
        m.addSource("findings", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
        m.addLayer({ id: "findings-pattern", type: "fill", source: "findings", paint: { "fill-pattern": ["concat", "stripe-", ["get", "category"]] } });
        m.addLayer({
          id: "findings-line",
          type: "line",
          source: "findings",
          paint: {
            "line-color": ["match", ["get", "category"], "new_water_candidate", WATER.new_water_candidate.color, "recession_candidate", WATER.recession_candidate.color, "#f3eee5"],
            "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 1.2],
          },
        });
        m.addSource("landmarks", {
          type: "geojson",
          data: { type: "FeatureCollection", features: LANDMARKS.map((l) => ({ type: "Feature", properties: { name: l.name }, geometry: { type: "Point", coordinates: l.lonLat } })) },
        });
        m.addLayer({ id: "landmark-dots", type: "circle", source: "landmarks", paint: { "circle-radius": 3, "circle-color": "#f3eee5", "circle-stroke-color": "#070b12", "circle-stroke-width": 1.5 } });
        landmarkEls.current = LANDMARKS.map((l) => {
          const label = document.createElement("span");
          label.className = "c-landmark";
          label.dataset.name = l.name;
          label.textContent = l.name;
          new ml.Marker({ element: label, anchor: "top", offset: [0, 5] }).setLngLat(l.lonLat).addTo(m);
          return label;
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
        m.on("click", "footprints-fill", (e: MapMouseEvent & { features?: { id?: string | number }[] }) => latest.current.onPick?.(String(e.features?.[0]?.id ?? "") || null));
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
    }).catch(() => { if (!dead) setError("The interactive map could not start. Check WebGL support and reload."); });
    return () => {
      dead = true;
      disposeTheme?.();
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

  // One set of place names per language, never both on top of each other: in English the basemap's own place labels;
  // in Bangla our landmark labels instead (the basemap has no Bengali names, and WebGL text can't shape Bengali).
  useEffect(() => {
    const m = map.current;
    nameLandmarks(landmarkEls.current, t.landmarks, lang === "bn");
    if (!m || !ready) return;
    if (m.getLayer("landmark-dots")) m.setLayoutProperty("landmark-dots", "visibility", lang === "bn" ? "visible" : "none");
    m.setConfigProperty("basemap", "showPlaceLabels", lang !== "bn");
  }, [t, lang, ready]);

  // the quicklook: its corners (stored in the frozen case, else fetched), then swap the image source in place (no flash
  // between dates). Replaying the frozen case never reaches ASF: a scene outside it is reported, not fetched.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!image) {
      if (m.getLayer("browse")) m.removeLayer("browse");
      if (m.getSource("browse")) m.removeSource("browse");
      return;
    }
    let live = true;
    const id = image.conceptId;
    const corners: Promise<[number, number][]> = image.frozen
      ? Promise.resolve(image.frozen.corners)
      : replaying
        ? Promise.reject(new Error("not in the frozen case"))
        : fetch(browseUrl(image, "bounds"))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((j: { corners: [number, number][] }) => j.corners);
    corners
      .then((c) => {
        if (!live) return;
        if (c.length !== 4) throw new Error("expected four corners");
        const corners = c as [[number, number], [number, number], [number, number], [number, number]];
        const url = quicklookSrc(image);
        const src = m.getSource("browse") as ImageSource | undefined;
        if (src) src.updateImage({ url, coordinates: corners });
        else {
          m.addSource("browse", { type: "image", url, coordinates: corners });
          m.addLayer(
            { id: "browse", type: "raster", source: "browse", paint: { "raster-opacity": imageOpacity, "raster-emissive-strength": 1, "raster-fade-duration": 0, "raster-resampling": "linear" } },
            "boundary-glow",
          );
        }
        m.once("idle", () => live && setImg({ id, state: "shown" }));
      })
      .catch(() => live && setImg({ id, state: replaying && !image.frozen ? "absent" : "failed" }));
    return () => {
      live = false;
    };
  }, [image, ready, replaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (m?.getLayer("browse")) m.setPaintProperty("browse", "raster-opacity", imageOpacity);
  }, [imageOpacity, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let live = true;
    if (!processed) {
      if (m.getLayer("processed")) m.removeLayer("processed");
      if (m.getSource("processed")) m.removeSource("processed");
      return;
    }
    // Preload so failed requests cannot silently leave an old date/layer visible.
    const controller = new AbortController();
    let objectUrl: string | undefined;
    if (m.getLayer("processed")) m.removeLayer("processed");
    if (m.getSource("processed")) m.removeSource("processed");
    fetch(processed.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(r => {
      if (!r.ok) throw new Error("Layer unavailable");
      return r.blob();
    }).then(blob => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
        m.addSource("processed", { type: "image", url: objectUrl, coordinates: processed.corners });
        m.addLayer({ id: "processed", type: "raster", source: "processed", paint: { "raster-opacity": imageOpacity, "raster-emissive-strength": 1, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, "boundary-glow");
      m.once("idle", () => { if (live) setRasterShown(processed.url); });
      setRasterError(null);
    }).catch(() => { if (live) setRasterError("The processed layer could not load. Retry or select another layer."); });
    return () => { live = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [processed, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map.current?.getLayer("processed")) map.current.setPaintProperty("processed", "raster-opacity", imageOpacity);
  }, [imageOpacity, ready]);

  const setPerspective = (enabled: boolean) => {
    const m = map.current;
    if (!m || !ready) return;
    setTerrain(enabled);
    m.setTerrain(enabled ? { source: "terrain-dem", exaggeration: 1 } : null);
    m.easeTo({ pitch: enabled ? 58 : 0, bearing: enabled ? -24 : 0, duration: cameraDuration() });
  };

  if (!MAPBOX_CONFIGURED) return <div className="c-map"><MapUnavailable /></div>;

  return (
    <div className="c-map" aria-label={label} role="region">
      <div ref={el} className="c-map-canvas" />
      {controls && <div className="map-view-tools">
        <button type="button" aria-pressed={!terrain} onClick={() => setPerspective(false)}>{t.map.analysis2d}</button>
        {allowTerrain && <button type="button" aria-pressed={terrain} onClick={() => setPerspective(true)}>{t.map.terrain3d}</button>}
        <button type="button" onClick={() => map.current?.easeTo({ center: [initialView.current.lon, initialView.current.lat], zoom: initialView.current.zoom, duration: cameraDuration() })}>{t.map.recenter}</button>
      </div>}
      {hover && (
        <div className="c-map-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <strong>{fmtDate(hover.a.start)}</strong>
          <span>
            {fmtTime(hover.a.start)} · {t.map.trackFrame(hover.a.track === null ? "–" : fmtNum(hover.a.track), hover.a.frame === null ? "–" : fmtNum(hover.a.frame))}
          </span>
          <span>
            {t.direction[hover.a.direction]} · {hover.a.polarizations.join("+")}
          </span>
        </div>
      )}
      {imgState === "loading" && <p className="c-map-note">{image?.frozen ? t.map.loading : t.map.loadingAsf}</p>}
      {imgState === "failed" && <p className="c-map-note is-bad">{t.map.failed}</p>}
      {imgState === "absent" && <p className="c-map-note is-bad">{t.map.absent}</p>}
      {error && <p className="c-map-note is-bad">{error}</p>}
      {rasterError && <p className="c-map-note is-bad">{rasterError}</p>}
      {processed && rasterShown !== processed.url && !rasterError && <p className="c-map-note" role="status">Loading calibrated layer…</p>}
    </div>
  );
}
