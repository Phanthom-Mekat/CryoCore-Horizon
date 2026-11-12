// Serves NISAR GCOV browse quicklooks for the map. ASF hosts them publicly but without CORS headers, and WebGL can only
// draw cross-origin images that have them, so the server fetches the image instead. The browser names a granule,
// never a URL: the address is built here, on the ASF host only. The processing lives in src/lib/chattogram/browse.ts,
// shared with the frozen case (scripts/freeze-case.mts).
import type { NextRequest } from "next/server";
import { COLLECTION, GRANULE, browseFile, corners, decode, toWebp, type Bbox } from "@/lib/chattogram/browse";

const CACHE_LIMIT = 48;
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
  const raw = () => once(`raw:${granule}`, () => decode(`${browseFile(collection, granule)}.png`));

  try {
    if (q.get("part") === "bounds") {
      const fp = (q.get("fp") ?? "").split(",").map(Number);
      const valid = fp.length === 4 && fp.every(Number.isFinite);
      const result = await once(`bounds:${granule}:${fp.join(",")}`, () => corners(collection, granule, raw, valid ? (fp as Bbox) : null));
      return Response.json({ corners: result.corners }, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
    }
    const body = await once(`img:${granule}`, async () => toWebp(await raw()));
    return new Response(body as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, immutable" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Upstream error", { status: 502 });
  }
}
