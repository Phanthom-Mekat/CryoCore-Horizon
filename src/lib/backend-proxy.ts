/** Only the two explicit public explorer routes use this server-side proxy. */
export async function proxyBackend(request: Request, path: "explorer" | "nasa/search") {
  const origin = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${origin}/api/v1/${path}${new URL(request.url).search}`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(70000),
    });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "The data service is unavailable. Start the FastAPI backend on port 8000, then retry." }, { status: 503 });
  }
}
