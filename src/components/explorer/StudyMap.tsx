"use client";

import { useEffect, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, ScaleControl, Source, type MapRef } from "react-map-gl/mapbox";
import { loadMapbox, MAPBOX_CONFIGURED, MAPBOX_TOKEN, mapStyle, followMapTheme } from "@/lib/mapbox";
import { MapUnavailable } from "@/components/maps/MapUnavailable";
import type { ExplorerData, SceneCollection } from "@/lib/explorer-data";
import { Focus, Layers3 } from "lucide-react";
import { useReducedMotion } from "motion/react";

export default function StudyMap({ data, scenes, selected, onSelect }: {
  data: ExplorerData; scenes: SceneCollection; selected: string | null; onSelect: (id: string) => void;
}) {
  const ref = useRef<MapRef>(null);
  const [style] = useState(mapStyle);
  const disposeTheme = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => disposeTheme.current?.(), []);
  const reduced = useReducedMotion();
  const [tilted, setTilted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [fatalError, setFatalError] = useState(false);
  const [hover, setHover] = useState(false);
  const focusRegion = () => {
    const [w, s, e, n] = data.region.bbox;
    ref.current?.fitBounds([[w, s], [e, n]], { padding: 55, duration: reduced ? 0 : 1000, pitch: 0, bearing: 0 });
    setTilted(false);
  };

  useEffect(() => {
    if (!loaded || !selected) return;
    const feature = scenes.features.find(f => f.properties.id === selected);
    if (!feature) return;
    const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    const points = rings.flat();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    ref.current?.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], {
      padding: 65, maxZoom: 9, duration: reduced ? 0 : 900,
    });
  }, [selected, scenes, loaded, reduced]);

  if (!MAPBOX_CONFIGURED) return <div className="atlas-map"><MapUnavailable /></div>;

  return <div className="atlas-map">
    <Map ref={ref} initialViewState={{ longitude: 91.65, latitude: 22.5, zoom: 6.8 }} mapStyle={style} mapboxAccessToken={MAPBOX_TOKEN} mapLib={loadMapbox()} projection="mercator"
      maxZoom={14} minZoom={3} style={{ width: "100%", height: "100%" }}
      onLoad={() => { setLoaded(true); focusRegion(); if (ref.current) disposeTheme.current = followMapTheme(ref.current.getMap()); }}
      onError={event => { if (!loaded && /webgl|context/i.test(event.error.message)) setFatalError(true); else setTileError(true); }}
      interactiveLayerIds={["scene-fill"]} cursor={hover ? "pointer" : "grab"}
      onMouseMove={event => setHover(Boolean(event.features?.length))}
      onMouseLeave={() => setHover(false)}
      onClick={event => { const id = event.features?.[0]?.properties?.id; if (id) onSelect(String(id)); }}>
      {loaded && <>
      <Source id="division" type="geojson" data={data.region.boundary}>
        <Layer id="division-fill" type="fill" paint={{ "fill-color": "#1686b0", "fill-opacity": 0.055 }} />
        <Layer id="division-glow" type="line" paint={{ "line-color": "#1686b0", "line-width": 7, "line-opacity": 0.1 }} />
        <Layer id="division-line" type="line" paint={{ "line-color": "#1686b0", "line-width": 1.6, "line-opacity": 0.85 }} />
      </Source>
      <Source id="scenes" type="geojson" data={scenes}>
        <Layer id="scene-fill" type="fill" paint={{ "fill-color": ["case", ["==", ["get", "id"], selected ?? ""], "#ffb454", "#3987e5"], "fill-opacity": ["case", ["==", ["get", "id"], selected ?? ""], 0.23, 0.003] }} />
        <Layer id="scene-line" type="line" paint={{ "line-color": "#3987e5", "line-opacity": 0.12, "line-width": 0.7 }} />
        <Layer id="selected-line" type="line" filter={["==", ["get", "id"], selected ?? ""]} paint={{ "line-color": "#ffb454", "line-width": 2.2 }} />
      </Source>
      <Layer id="division-top" source="division" type="line" paint={{ "line-color": "#1686b0", "line-width": 1.4 }} />
      <Marker longitude={91.7832} latitude={22.3569} anchor="bottom"><div className="atlas-place"><span />Chattogram city</div></Marker>
      </>}
      <NavigationControl position="bottom-right" visualizePitch />
      <ScaleControl position="bottom-left" unit="metric" />
    </Map>
    <div className="atlas-map-tools"><button onClick={focusRegion}><Focus size={15} /> Fit division</button><button aria-pressed={tilted} onClick={() => {
      ref.current?.easeTo({ pitch: tilted ? 0 : 50, bearing: tilted ? 0 : -15, duration: reduced ? 0 : 900 }); setTilted(!tilted);
    }}><Layers3 size={15} />{tilted ? "2D view" : "Tilt view"}</button></div>
    <div className="atlas-map-caption"><span className="atlas-dot" />CHITTAGONG HILL TRACTS · BAY OF BENGAL</div>
    {(tileError || fatalError) && <div className="atlas-map-warning" role="status">{fatalError ? "WebGL is unavailable. Scene details remain accessible in the list." : "Some basemap tiles could not load. Boundaries and NASA footprints are independent of the basemap."}</div>}
    <div className="atlas-legend"><span><i className="division" />Division boundary</span><span><i className="footprint" />Catalog footprint</span><span><i className="selected" />Selected scene</span></div>
  </div>;
}
