// NISAR GCOV browse quicklooks: fetch from ASF, make the declared no-data transparent, compress, and georeference.
// Shared by the live proxy (src/app/api/nisar-browse/route.ts) and the frozen case (scripts/freeze-case.mts), so a
// replayed image is byte-for-byte the same processing as a live one. Imports nothing from the app, so Node can run it.
//
// The LATLON quicklook is a lon/lat-aligned RGB PNG whose no-data is pure black, declared transparent in the PNG (tRNS).
// Its corners come from the matching KML. Older (provisional) products keep that KML behind an Earthdata login, so the
// corners are then derived instead: the valid-data extent of the image spans the footprint's lon/lat extremes from the
// NASA metadata. Checked against a public KML: within 0.13 km, about one pixel.
import sharp from "sharp";

export const ASF = "https://nisar.asf.earthdatacloud.nasa.gov";
export const GRANULE = /^NISAR_L2_[A-Z]{2}_GCOV_[A-Z0-9_]{20,160}$/;
export const COLLECTION = /^NISAR_L2_GCOV(_[A-Z]{2,12})?_V\d{1,3}$/; // e.g. NISAR_L2_GCOV_V1, NISAR_L2_GCOV_PROVISIONAL_V1
/** Display processing, recorded in the frozen case manifest. */
export const PROCESSING = { maxSide: 1400, format: "webp", quality: 76, alphaQuality: 80, noData: "pure black (PNG tRNS) made transparent" } as const;

export type Corners = [number, number][]; // top-left, top-right, bottom-right, bottom-left
export type Raw = { data: Buffer; width: number; height: number };
export type Bbox = [number, number, number, number]; // min lon, min lat, max lon, max lat

/** The public browse file for a granule (without extension). */
export const browseFile = (collection: string, granule: string) => `${ASF}/BROWSE/${collection}/${granule}/${granule}_LATLON`;

async function upstream(url: string) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`ASF answered HTTP ${r.status} for the browse file`);
  return r;
}

/** Full-resolution RGBA with the declared no-data (pure black) made transparent. */
export async function decode(url: string): Promise<Raw> {
  const src = Buffer.from(await (await upstream(url)).arrayBuffer());
  const { data, info } = await sharp(src).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + 3] = 0;
  return { data, width: info.width, height: info.height };
}

export async function toWebp({ data, width, height }: Raw) {
  const out = await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(PROCESSING.maxSide, PROCESSING.maxSide, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: PROCESSING.quality, alphaQuality: PROCESSING.alphaQuality })
    .toBuffer();
  return new Uint8Array(out);
}

/** The KML's LatLonQuad runs counter-clockwise from lower-left. */
export async function kmlCorners(url: string): Promise<Corners> {
  const kml = await (await upstream(url)).text();
  const pts = kml.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1].trim().split(/\s+/).map((p) => p.split(",").slice(0, 2).map(Number));
  if (!pts || pts.length !== 4 || pts.flat().some((v) => !Number.isFinite(v))) throw new Error("The browse KML has no usable corners");
  const [ll, lr, ur, ul] = pts as Corners;
  return [ul, ur, lr, ll];
}

/** Image corners from where valid pixels start and end, matched to the footprint's lon/lat extremes. */
export function derivedCorners({ data, width, height }: Raw, [minLon, minLat, maxLon, maxLat]: Bbox): Corners {
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0 || y1 < y0) throw new Error("The quicklook has no valid pixels");
  const sx = (maxLon - minLon) / (x1 + 1 - x0);
  const sy = (maxLat - minLat) / (y1 + 1 - y0);
  const w = minLon - x0 * sx;
  const n = maxLat + y0 * sy;
  const e = w + width * sx;
  const s = n - height * sy;
  return [[w, n], [e, n], [e, s], [w, s]];
}

/** Corners from the public KML, else derived from the image and the footprint extremes. */
export async function corners(collection: string, granule: string, raw: () => Promise<Raw>, fp: Bbox | null): Promise<{ corners: Corners; from: "kml" | "footprint" }> {
  try {
    return { corners: await kmlCorners(`${browseFile(collection, granule)}.kml`), from: "kml" };
  } catch (e) {
    if (!fp) throw e;
    return { corners: derivedCorners(await raw(), fp), from: "footprint" };
  }
}

/** Footprint ring → [min lon, min lat, max lon, max lat]. */
export const bboxOf = (ring: [number, number][]): Bbox => {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
};
