/**
 * Server-side proxy to the FastAPI backend. Only route handlers call it, each with a fixed path or one built from
 * strictly validated segments; the browser never names a backend path itself. Status, body and the content headers
 * pass through, so JSON, PNG assets and file exports all work. The body is read here, inside the try, so a backend that
 * drops mid-response becomes a clean 503 rather than a broken stream.
 */
export async function proxyBackend(request: Request, path: string, search = new URL(request.url).search) {
  const origin = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${origin}/api/v1/${path}${search}`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(70000),
    });
    const body = await response.arrayBuffer();
    const headers = new Headers({ "Content-Type": response.headers.get("Content-Type") ?? "application/json", "Cache-Control": response.headers.get("Cache-Control") ?? "no-store" });
    const disposition = response.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new Response(body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "The data service is unavailable. Start the FastAPI backend (see backend/README.md), then retry." }, { status: 503 });
  }
}
