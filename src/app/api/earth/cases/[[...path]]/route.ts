export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const valid = path.length === 0 || (/^[a-f0-9]{24}$/.test(path[0]) &&
    (path.length === 1 || (path.length === 3 && ["display", "assets"].includes(path[1]) && /^(before|after|change|common)-(HHHH|HVHV)\.tif$/.test(path[2]))));
  if (!valid) return Response.json({ detail: "Unknown case resource." }, { status: 404 });
  const query = new URL(request.url).searchParams.get("bounds") === "true" ? "?bounds=true" : "";
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
