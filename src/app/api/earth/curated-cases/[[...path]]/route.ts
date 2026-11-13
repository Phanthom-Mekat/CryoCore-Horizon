// Read-only proxy for the processed-case API. Only these shapes are forwarded; every segment is checked against a strict
// pattern first, so no other backend path (and no job creation) can be reached from the browser:
//   /api/earth/curated-cases                          -> /api/v1/curated-cases
//   /api/earth/curated-cases/{id}                     -> /api/v1/curated-cases/{id}
//   /api/earth/curated-cases/{id}/layers|findings|timeseries|sensitivity
//   /api/earth/curated-cases/{id}/export?format=json|csv|geojson
//   /api/earth/curated-cases/{id}/assets/{name}.png   -> PNG, cached (the URL carries ?v=<updated_at>)
//   /api/earth/curated-cases/{id}/findings/{fid}      -> /api/v1/findings/{fid}
import { proxyBackend } from "@/lib/backend-proxy";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FINDING = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ASSET = /^[a-z0-9][a-z0-9_-]{0,63}\.png$/;
const FORMAT = /^(json|csv|geojson)$/;

const notFound = () => Response.json({ detail: "Unknown case path" }, { status: 404 });

export async function GET(request: Request, ctx: RouteContext<"/api/earth/curated-cases/[[...path]]">) {
  const [id, part, name, ...rest] = (await ctx.params).path ?? [];
  if (rest.length || (id !== undefined && !ID.test(id))) return notFound();
  if (id === undefined) return proxyBackend(request, "curated-cases", "");
  if (part === undefined) return proxyBackend(request, `curated-cases/${id}`, "");
  if (name === undefined) {
    if (part === "layers" || part === "findings" || part === "timeseries" || part === "sensitivity") return proxyBackend(request, `curated-cases/${id}/${part}`, "");
    if (part === "export") {
      const format = new URL(request.url).searchParams.get("format") ?? "json";
      return FORMAT.test(format) ? proxyBackend(request, `curated-cases/${id}/export`, `?format=${format}`) : notFound();
    }
    return notFound();
  }
  if (part === "findings" && FINDING.test(name)) return proxyBackend(request, `findings/${encodeURIComponent(name)}`, "");
  if (part === "assets" && ASSET.test(name)) {
    const r = await proxyBackend(request, `curated-cases/${id}/assets/${name}`, "");
    if (!r.ok || !r.headers.get("Content-Type")?.startsWith("image/png")) return r.ok ? Response.json({ detail: "Not a PNG asset" }, { status: 502 }) : r;
    // the browser asks with ?v=<case updated_at>, so a republished case gets a new URL and this copy can be kept
    r.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return r;
  }
  return notFound();
}
