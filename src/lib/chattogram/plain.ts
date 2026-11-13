// The plain reading of the curated case: one everyday category per change region (backend app/processing/plain.py),
// drawn as plain.png. A tap on the map reads the category back from that PNG's pixel, so it also works in a replay.
import { useEffect, useState } from "react";
import type { CaseLayer, PlainId, ProcessedCase } from "./case-api";

export type PlainReading = { kind: "outside" } | { kind: "none" } | { kind: "category"; id: PlainId };

export const plainLayer = (pc: ProcessedCase | null) => pc?.layers.find((l) => l.id === "plain" && l.categories?.length) ?? null;

/** The finding's category, when the case has a plain reading for it. */
export function plainOf(pc: ProcessedCase | null, findingId: string): PlainId | null {
  const layer = plainLayer(pc);
  const id = layer?.by_finding?.[findingId];
  return layer?.categories?.some((c) => c.id === id) ? (id as PlainId) : null;
}

/**
 * Pixel of [lon, lat] in a north-up EPSG:4326 image with corners TL, TR, BR, BL: the backend writes plain.png on a
 * regular lon/lat grid, so the position is linear in both. null outside the image.
 */
export function pixelAt(corners: [number, number][], width: number, height: number, [lon, lat]: [number, number]) {
  const [[west, north], , [east, south]] = corners;
  const x = Math.floor(((lon - west) / (east - west)) * width);
  const y = Math.floor(((north - lat) / (north - south)) * height);
  return x < 0 || y < 0 || x >= width || y >= height ? null : { x, y };
}

/**
 * Which category an RGBA pixel is. The backend writes each category's colour exactly, but reading a semi-transparent
 * pixel back through a canvas can round it, so the nearest colour within a small distance wins. Water (both dates)
 * and water came share a hue and differ in alpha (faint = both dates). Alpha 0 is no category.
 */
export function categoryOf(layer: Pick<CaseLayer, "categories">, rgba: ArrayLike<number>): PlainId | null {
  if (rgba[3] === 0) return null;
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const near = (layer.categories ?? []).filter((c) => hex(c.color).every((v, i) => Math.abs(v - rgba[i]) <= 6));
  if (near.length > 1) return near.find((c) => (rgba[3] < 160) === (c.id === "water"))?.id ?? null;
  return near[0]?.id ?? null;
}

/** Ray casting: is [lon, lat] inside the polygon's outer ring? */
export function inside(polygon: GeoJSON.Polygon, [x, y]: [number, number]) {
  const ring = polygon.coordinates[0];
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Reads the plain layer's pixels once (from `url`), then answers what the map shows at any point of `area`. */
export function usePlainReader(url: string | null, layer: CaseLayer | null, area: GeoJSON.Polygon | null) {
  const [pixels, setPixels] = useState<{ url: string; data: ImageData } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      // no premultiplying or colour management: the pixel values are category codes, not a picture
      .then((b) => createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then((bmp) => {
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        if (live) setPixels({ url, data: ctx.getImageData(0, 0, bmp.width, bmp.height) });
      })
      .catch(() => live && setPixels(null));
    return () => {
      live = false;
    };
  }, [url]);
  const ready = !!layer && !!pixels && pixels.url === url;
  return {
    ready,
    read(point: [number, number]): PlainReading | null {
      if (!ready) return null;
      const { data } = pixels;
      const at = pixelAt(layer.corners, data.width, data.height, point);
      if (!at || (area && !inside(area, point))) return { kind: "outside" };
      const i = (at.y * data.width + at.x) * 4;
      const id = categoryOf(layer, data.data.subarray(i, i + 4));
      return id ? { kind: "category", id } : { kind: "none" };
    },
  };
}

export type Columns = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; color: string; h: number }>;
/** Metres of column per dB of mean change: a visual scale only (3 dB → 270 m), stated on the map wherever it is drawn. */
export const COLUMN_M_PER_DB = 90;

/** Each finding as a 3D column: coloured by its plain category, as tall as its mean radar change. */
export function columnsOf(pc: ProcessedCase | null): Columns | null {
  const layer = plainLayer(pc);
  if (!pc || !layer) return null;
  const color = Object.fromEntries((layer.categories ?? []).map((c) => [c.id, c.color]));
  const features = pc.findings.features.flatMap((f) => {
    const id = plainOf(pc, f.properties.id);
    return id ? [{ ...f, properties: { id: f.properties.id, color: color[id], h: Math.round(Math.abs(f.properties.mean_delta_db) * COLUMN_M_PER_DB) } }] : [];
  });
  return { type: "FeatureCollection", features };
}
