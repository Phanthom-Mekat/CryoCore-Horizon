// The case assistant. POST streams the backend's events (one JSON object per line) straight through, so the sidebar
// shows each step and moves the map while the answer is still being written. Only these two backend paths are reached.
import { proxyBackend } from "@/lib/backend-proxy";

const unavailable = () =>
  Response.json({ detail: "The data service is unavailable. Start the FastAPI backend (see backend/README.md), then retry." }, { status: 503 });

export async function POST(request: Request) {
  const origin = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${origin}/api/v1/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(115000)]), // the backend stops itself at 100 s
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}

export async function GET(request: Request) {
  return proxyBackend(request, "assistant/status", "");
}
