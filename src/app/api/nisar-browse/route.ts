// Serves NISAR GCOV browse quicklooks for the map. ASF hosts them publicly but without CORS headers, and WebGL can only
// draw cross-origin images that have them, so the server fetches the image instead. The browser names a granule,
// never a URL: the address is built here, on the ASF host only.
//
// The LATLON quicklook is a lon/lat-aligned RGB PNG whose no-data is pure black, declared transparent in the PNG (tRNS).
// Its corners come from the matching KML. Older (provisional) products keep that KML behind an Earthdata login, so the
// corners are then derived instead: the valid-data extent of the image spans the footprint's lon/lat extremes from the
// NASA metadata (`fp`). Checked against a public KML: within 0.13 km, about one pixel.
import sharp from "sharp";
import type { NextRequest } from "next/server";

const ASF = "https://nisar.asf.earthdatacloud.nasa.gov";
const GRANULE = /^NISAR_L2_[A-Z]{2}_GCOV_[A-Z0-9_]{20,160}$/;
const COLLECTION = /^NISAR_L2_GCOV(_[A-Z]{2,12})?_V\d{1,3}$/; // e.g. NISAR_L2_GCOV_V1, NISAR_L2_GCOV_PROVISIONAL_V1
const MAX_SIDE = 1600;
const CACHE_LIMIT = 48;

type Corners = [number, number][]; // top-left, top-right, bottom-right, bottom-left
type Raw = { data: Buffer; width: number; height: number };
const cache = new Map<string, Promise<unknown>>(); // small and process-local; browsers cache the responses too

function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    const job = make();
    cache.set(key, job);
    job.catch(() => cache.delete(key)); // don't keep failures
  }
  return cache.get(key) as Promise<T>;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const granule = q.get("granule") ?? "";
  const collection = q.get("collection") ?? "NISAR_L2_GCOV_V1";
  if (!GRANULE.test(granule) || !COLLECTION.test(collection)) return new Response("Unknown NISAR granule", { status: 400 });
  const file = (root: string) => `${ASF}/${root}/${collection}/${granule}/${granule}_LATLON`;
  const raw = () => once(`raw:${granule}`, () => decode(`${file("BROWSE")}.png`));

  try {
    if (q.get("part") === "bounds") {
      const fp = (q.get("fp") ?? "").split(",").map(Number);
      const corners = await once(`bounds:${granule}:${fp.join(",")}`, () =>
        kmlCorners(`${file("BROWSE")}.kml`).catch(async (e) => {
          if (fp.length !== 4 || fp.some((v) => !Number.isFinite(v))) throw e;
          return derivedCorners(await raw(), fp as [number, number, number, number]);
        }),
      );
      return Response.json({ corners }, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
    }
    const body = await once(`img:${granule}`, async () => toWebp(await raw()));
    return new Response(body as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, immutable" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Upstream error", { status: 502 });
  }
}

async function upstream(url: string) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`ASF answered HTTP ${r.status} for the browse file`);
  return r;
}

/** Full-resolution RGBA with the declared no-data (pure black) made transparent. */
async function decode(url: string): Promise<Raw> {
  const src = Buffer.from(await (await upstream(url)).arrayBuffer());
  const { data, info } = await sharp(src).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + 3] = 0;
  return { data, width: info.width, height: info.height };
}

async function toWebp({ data, width, height }: Raw) {
  const out = await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  return new Uint8Array(out);
}

/** The KML's LatLonQuad runs counter-clockwise from lower-left. */
async function kmlCorners(url: string): Promise<Corners> {
  const kml = await (await upstream(url)).text();
  const pts = kml.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1].trim().split(/\s+/).map((p) => p.split(",").slice(0, 2).map(Number));
  if (!pts || pts.length !== 4 || pts.flat().some((v) => !Number.isFinite(v))) throw new Error("The browse KML has no usable corners");
  const [ll, lr, ur, ul] = pts as Corners;
  return [ul, ur, lr, ll];
}

/** Image corners from where valid pixels start and end, matched to the footprint's lon/lat extremes. */
function derivedCorners({ data, width, height }: Raw, [minLon, minLat, maxLon, maxLat]: [number, number, number, number]): Corners {
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
