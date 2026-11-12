export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const valid = path.length === 0 || (/^[a-f0-9]{24}$/.test(path[0]) &&
    (path.length === 1 || (path.length === 2 && ["sample", "brief", "area"].includes(path[1])) || (path.length === 3 && ["display", "assets"].includes(path[1]) && /^(before|after|change|common)-(HHHH|HVHV)\.tif$/.test(path[2]))));
  if (!valid) return Response.json({ detail: "Unknown case resource." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  let query = params.get("bounds") === "true" ? "?bounds=true" : "";
  if (path[1] === "area") {
    const clean = new URLSearchParams();
    for (const key of ["lon1", "lat1", "lon2", "lat2"]) {
      const value = Number(params.get(key));
      if (!params.get(key)?.trim() || !Number.isFinite(value) || Math.abs(value) > (key.startsWith("lon") ? 180 : 85))
        return Response.json({ detail: "Enter valid selection coordinates." }, { status: 422 });
      clean.set(key, String(value));
    }
    query = `?${clean}`;
  }
  if (path[1] === "brief") {
    const format = params.get("format") ?? "json";
    if (!["json", "csv"].includes(format)) return Response.json({ detail: "Unknown brief format." }, { status: 422 });
    query = `?format=${format}`;
  }
  if (path[1] === "sample") {
    const longitude = Number(params.get("longitude")), latitude = Number(params.get("latitude"));
    if (!["longitude", "latitude"].every(k => params.has(k) && params.get(k)?.trim()) || !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90)
      return Response.json({ detail: "Enter valid longitude and latitude." }, { status: 422 });
    query = `?${new URLSearchParams({ longitude: String(longitude), latitude: String(latitude) })}`;
  }
  try {
    const response = await fetch(`${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/v1/cases${path.length ? "/" + path.join("/") : ""}${query}`, {
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" });
    if (response.headers.has("Content-Disposition")) headers.set("Content-Disposition", response.headers.get("Content-Disposition")!);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "Processed data is unavailable. Try again shortly." }, { status: 503 });
  }
}
