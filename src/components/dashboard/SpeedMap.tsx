"use client";

import { useEffect, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, ScaleControl, Source, type MapRef } from "react-map-gl/mapbox";
import { loadMapbox, MAPBOX_CONFIGURED, MAPBOX_TOKEN, mapStyle, followMapTheme, mapError, cameraDuration } from "@/lib/mapbox";
import { MapUnavailable } from "@/components/maps/MapUnavailable";
import { DATA_ROOT, SERIES_COLORS, UNIT_LABEL, fmtDayShort, nearestIndex, rampColor, toGrid, toUnit, type Fronts, type Manifest, type Pair, type SpeedUnit } from "@/lib/dashboard-data";

export type Layers = { speed: boolean; fronts: boolean; probes: boolean };

type Grid = { code: Uint8ClampedArray; ok: Uint8ClampedArray };
const cache = new globalThis.Map<string, Promise<Grid>>();

/** Decodes a speed PNG (gray = speed, alpha = valid) into arrays. Cached per file. */
function loadGrid(src: string, w: number, h: number) {
  if (!cache.has(src))
    cache.set(
      src,
      new Promise<Grid>((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          const code = new Uint8ClampedArray(w * h);
          const ok = new Uint8ClampedArray(w * h);
          for (let i = 0; i < w * h; i++) {
            code[i] = d[i * 4];
            ok[i] = d[i * 4 + 3] > 0 ? 1 : 0;
          }
          res({ code, ok });
        };
        img.onerror = () => rej(new Error(`could not load ${src}`));
        img.src = DATA_ROOT + src;
      }),
    );
  return cache.get(src)!;
}

/** The source assets are geographic grids; Mapbox image quads are Mercator.
 * Reproject rows for display, keeping numeric reads on the original grid. */
function mercatorCanvas(source: HTMLCanvasElement | HTMLImageElement, south: number, north: number) {
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const out = document.createElement("canvas");
  out.width = width; out.height = height;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const top = merc(north), bottom = merc(south);
  for (let row = 0; row < height; row++) {
    const y = top + ((row + 0.5) / height) * (bottom - top);
    const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
    const srcRow = Math.min(height - 1, Math.max(0, Math.floor((north - lat) / (north - south) * height)));
    ctx.drawImage(source, 0, srcRow, width, 1, 0, row, width, 1);
  }
  return out.toDataURL("image/png");
}

export function SpeedMap({ manifest, fronts, pair, layers, units = "mday", frontDate }: {
  manifest: Manifest; fronts: Fronts; pair: Pair; layers: Layers; units?: SpeedUnit; frontDate?: string;
}) {
  const { width: W, height: H } = manifest.grid;
  const [w, s, e, n] = manifest.bbox;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[w,n], [e,n], [e,s], [w,s]];
  const ref = useRef<MapRef>(null);
  const disposeTheme = useRef<(() => void) | undefined>(undefined);
  const [style] = useState(mapStyle);
  const [loaded, setLoaded] = useState(false);
  const [raster, setRaster] = useState<{ path: string; grid: Grid; url: string } | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ lon: number; lat: number } | null>(null);
  useEffect(() => () => disposeTheme.current?.(), []);

  useEffect(() => {
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setBase(mercatorCanvas(image, s, n)); };
    image.onerror = () => { if (live) setError("The NASA context image could not load."); };
    image.src = DATA_ROOT + manifest.basemap.src;
    return () => { live = false; };
  }, [manifest.basemap.src, s, n]);

  useEffect(() => {
    let live = true;
    loadGrid(pair.speed, W, H).then(g => {
      if (!live) return;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        if (!g.ok[i]) continue;
        const v = g.code[i] / 255;
        const [r, green, b] = rampColor(v / 0.75);
        img.data.set([r, green, b, Math.round(255 * 0.92 * Math.min(1, Math.max(0, (v * manifest.speedMax - 0.6) / 5)))], i * 4);
      }
      ctx.putImageData(img, 0, 0);
      setRaster({ path: pair.speed, grid: g, url: mercatorCanvas(canvas, s, n) });
    }).catch(() => { if (live) setError("The speed layer could not load. Try another date."); });
    const i = manifest.pairs.indexOf(pair);
    for (const j of [i - 1, i + 1]) if (manifest.pairs[j]) loadGrid(manifest.pairs[j].speed, W, H).catch(() => {});
    return () => { live = false; };
  }, [pair, W, H, manifest, s, n]);

  const current = raster?.path === pair.speed ? raster : null;
  const endFront = fronts.fronts.length ? fronts.fronts[nearestIndex(fronts.fronts.map(f => f.date), frontDate ?? pair.end)] : undefined;
  const lines: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: fronts.fronts.map(f => ({ type: "Feature", properties: { current: f.date === endFront?.date }, geometry: { type: "LineString", coordinates: f.line } })) };
  const flow: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: fronts.flowline } };
  const point = hover ? toGrid(manifest, hover.lon, hover.lat).map(Math.floor) : null;
  const inGrid = point && point[0] >= 0 && point[0] < W && point[1] >= 0 && point[1] < H;
  const index = inGrid ? point[1] * W + point[0] : -1;
  const value = current && index >= 0 && current.grid.ok[index] ? current.grid.code[index] / 255 * manifest.speedMax : null;
  const fit = () => ref.current?.fitBounds([[w,s],[e,n]], { padding: 40, pitch: 0, bearing: 0, duration: cameraDuration() });

  if (!MAPBOX_CONFIGURED) return <figure className="map"><MapUnavailable /></figure>;
  return <figure className="map">
    <div className="glacier-map">
      <Map ref={ref} mapLib={loadMapbox()} mapboxAccessToken={MAPBOX_TOKEN} mapStyle={style}
        projection="mercator" initialViewState={{ bounds: [[w,s],[e,n]], fitBoundsOptions: { padding: 40 } }}
        style={{ width: "100%", height: "100%" }} maxPitch={60}
        onLoad={() => { setLoaded(true); if (ref.current) disposeTheme.current = followMapTheme(ref.current.getMap()); }}
        onError={event => setError(mapError(event.error.message))}
        onMouseMove={event => setHover({ lon: event.lngLat.lng, lat: event.lngLat.lat })}
        onClick={event => setHover({ lon: event.lngLat.lng, lat: event.lngLat.lat })}
        onMouseLeave={() => setHover(null)}>
        {loaded && <>
        {base && <Source id="glacier-context" type="image" url={base} coordinates={coordinates}>
          <Layer id="glacier-context" type="raster" paint={{ "raster-emissive-strength": 1, "raster-fade-duration": 0, "raster-saturation": layers.speed ? -0.9 : -0.25, "raster-brightness-max": layers.speed ? 0.42 : 0.8 }} />
        </Source>}
        {layers.speed && current && <Source id="glacier-speed" type="image" url={current.url} coordinates={coordinates}>
          <Layer id="glacier-speed" type="raster" paint={{ "raster-emissive-strength": 1, "raster-fade-duration": 0, "raster-resampling": "nearest" }} />
        </Source>}
        {layers.fronts && <Source id="glacier-fronts" type="geojson" data={lines}>
          <Layer id="glacier-fronts" type="line" paint={{ "line-color": "#ffffff", "line-width": ["case", ["get","current"], 3, 1.2], "line-opacity": ["case", ["get","current"], 1, 0.4] }} />
        </Source>}
        {layers.probes && <Source id="glacier-flow" type="geojson" data={flow}><Layer id="glacier-flow" type="line" paint={{ "line-color": "#ffffff", "line-width": 1.2, "line-dasharray": [4,4] }} /></Source>}
        {layers.probes && manifest.probes.map(p => <Marker key={p.id} longitude={p.lon} latitude={p.lat}><div className="glacier-probe" style={{ borderColor: SERIES_COLORS[p.id] ?? "#fff" }}><span>{p.label}</span></div></Marker>)}
        </>}
        <NavigationControl position="top-right" visualizePitch />
        <ScaleControl position="bottom-left" unit="metric" />
      </Map>
      <div className="map-view-tools"><button type="button" onClick={fit}>Fit glacier</button><button type="button" onClick={() => ref.current?.easeTo({ pitch: 50, duration: cameraDuration() })}>Tilt view</button></div>
      <output className="map-readout" aria-live="off">{hover ? <><strong>{!current ? "Loading speed layer" : value === null ? "No ice-speed data" : `${toUnit(value, units).toFixed(1)} ${UNIT_LABEL[units]}`}</strong><span>{hover.lat.toFixed(3)}°, {hover.lon.toFixed(3)}°</span></> : <span>Point or tap to read speed · drag to pan</span>}</output>
      {layers.fronts && endFront && <span className="glacier-front-date">Front, {fmtDayShort(endFront.date)}</span>}
      {error && <p className="map-error" role="status">{error}</p>}
    </div>
    <figcaption>Basemap: {manifest.basemap.caption}. Mapbox provides geographic context; tilted views are illustrative.</figcaption>
  </figure>;
}
