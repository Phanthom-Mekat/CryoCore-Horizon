"""The case assistant: a Gemini function-calling loop over read-only tools on the published curated case, plus
"UI actions" (show on the map, switch layer, open a page, download a brief) that the browser carries out.

Every number the assistant gives comes from a tool reading the published bundle in data/cases/<id>/; the system
prompt forbids inventing any, and the plain reading stays "likely, not checked on the ground". The Gemini key stays
here (GEMINI_API_KEY in backend/.env) and never reaches the browser.
"""

import json
import math
import threading
import time
from collections import deque
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel, Field
from shapely.geometry import Point, shape

from .cases import definitions
from .config import Settings
from .processing import plain

CASE_ID = "karnaphuli-estuary"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_ROUNDS = 6  # model turns per question; each may call several tools
DEADLINE_S = 100  # the assistant's Next.js proxy route gives up at 115 s
RETRY_STATUS = {429, 500, 502, 503, 504}
PAGES = ("overview", "tour", "explore", "compare", "processed", "evidence", "catalogue", "about")
LAYERS = ("plain", "change_db", "before_db", "after_db", "quicklook")
PLAIN_IDS = [cid for _, cid, _ in plain.CATEGORIES]


class ChatMessage(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=4000)


class ChatContext(BaseModel):
    page: str | None = Field(None, max_length=40)
    lang: Literal["en", "bn"] = "en"
    point: tuple[float, float] | None = None  # [lon, lat] the viewer tapped
    finding: str | None = Field(None, max_length=40)
    layer: str | None = Field(None, max_length=20)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    context: ChatContext = ChatContext()




class AssistantUnavailable(Exception):
    """Gemini could not answer (no key, quota, outage). The message is safe to show."""


# ---------- read-only tools over the published bundle ----------

class CaseTools:
    def __init__(self, case_dir: Path, allow_synthetic: bool = False):
        self.dir = case_dir
        if not (case_dir / "manifest.json").is_file():
            raise AssistantUnavailable("The Karnaphuli case isn't processed yet, so there is nothing to answer from.")
        self.manifest = self._json("manifest.json")
        if self.manifest.get("synthetic_fixture") and not allow_synthetic:  # same rule as the case API (cases.py)
            raise AssistantUnavailable("The Karnaphuli case isn't processed yet, so there is nothing to answer from.")
        self.findings = self._json("findings.geojson")["features"]
        layers = {l["id"]: l for l in self.manifest.get("layers", [])}
        self.plain_layer = layers.get("plain")
        self.layers = layers
        self.definition = definitions().get(CASE_ID) or {}
        self.area = shape(self.definition["geometry"]) if self.definition else None
        self.actions: list[dict] = []

    def _json(self, name: str):
        return json.loads((self.dir / name).read_text(encoding="utf-8"))

    def _plain_of(self, fid: str) -> str | None:
        return (self.plain_layer or {}).get("by_finding", {}).get(fid)

    def _pixel(self, layer_id: str, lon: float, lat: float):
        layer = self.layers.get(layer_id)
        if not layer:
            return None
        with Image.open(self.dir / layer["file"]) as im:
            (west, north), _, (east, south), _ = layer["corners"]
            x = int((lon - west) / (east - west) * im.width)
            y = int((north - lat) / (north - south) * im.height)
            if not (0 <= x < im.width and 0 <= y < im.height):
                return None
            return im.convert("RGBA").getpixel((x, y))

    def _summary(self, f: dict, origin: tuple[float, float] | None = None) -> dict:
        p, c = f["properties"], shape(f["geometry"]).representative_point()
        out = {"id": p["id"], "plain": self._plain_of(p["id"]), "kind": p["kind"], "area_km2": p["area_km2"],
               "mean_change_db": p["mean_delta_db"], "quality": p["quality"], "lon": round(c.x, 5), "lat": round(c.y, 5)}
        if origin:
            out["distance_km"] = round(_km(origin, (c.x, c.y)), 2)
        return out

    # The model sees these docstrings' first lines as tool descriptions (see DECLARATIONS).
    def get_case_overview(self) -> dict:
        m, props = self.manifest, self.definition.get("properties", {})
        return {
            "title": props.get("title"), "place": props.get("place"),
            "before_date": ((props.get("before") or {}).get("date") or "")[:10] or None,
            "after_date": ((props.get("after") or {}).get("date") or "")[:10] or None,
            "metrics": m.get("metrics"), "method": {"name": m["method"]["name"], "version": m["method"]["version"]},
            "plain_reading": [{"id": c["id"], "area_km2": c["area_km2"]} for c in (self.plain_layer or {}).get("categories", [])],
            "findings_listed": len(self.findings), "caveats": m.get("caveats", []),
            "sources": [s.get("granule") for s in m.get("sources", [])] or None,
        }

    def list_findings(self, category: str | None = None, kind: str | None = None, near_lon: float | None = None,
                      near_lat: float | None = None, limit: int = 5) -> dict:
        origin = (near_lon, near_lat) if near_lon is not None and near_lat is not None else None
        rows = [self._summary(f, origin) for f in self.findings
                if (not category or self._plain_of(f["properties"]["id"]) == category)
                and (not kind or f["properties"]["kind"] == kind)]
        rows.sort(key=lambda r: r["distance_km"] if origin else -r["area_km2"])
        return {"count": len(rows), "findings": rows[: max(1, min(int(limit), 10))],
                "sorted_by": "distance" if origin else "area, largest first"}

    def get_finding(self, finding_id: str) -> dict:
        f = next((f for f in self.findings if f["properties"]["id"] == finding_id), None)
        if not f:
            return {"error": f"No finding {finding_id} in this case."}
        sens = self._json("sensitivity.json") if (self.dir / "sensitivity.json").is_file() else {}
        return {**self._summary(f), **{k: f["properties"][k] for k in
                ("median_before_db", "median_after_db", "valid_fraction", "quality_reason")},
                "highest_threshold_db_still_found": sens.get("highest_threshold_by_finding", {}).get(finding_id)}

    def explain_point(self, lon: float, lat: float) -> dict:
        if self.area is not None and not self.area.contains(Point(lon, lat)):
            return {"inside_analysis_area": False}
        rgba = self._pixel("plain", lon, lat)
        category = None
        if rgba and rgba[3]:
            category = next((cid for _, cid, col in plain.CATEGORIES if tuple(col) == tuple(rgba)), None)
        def db(layer_id):  # display PNGs: gray 0..255 on the layer's fixed scale, clipped at both ends
            px, layer = self._pixel(layer_id, lon, lat), self.layers.get(layer_id)
            if not px or not px[3]:
                return None
            lo, hi = layer["scale"]["min"], layer["scale"]["max"]
            return round(lo + px[0] / 255 * (hi - lo), 1)
        nearest = min(self.findings, key=lambda f: _km((lon, lat), shape(f["geometry"]).representative_point().coords[0]),
                      default=None)
        return {"inside_analysis_area": True, "plain": category or "none",
                "hh_before_db_display": db("before_db"), "hh_after_db_display": db("after_db"),
                "note": "dB read from display images on a -25..0 dB scale (clipped), about 0.1 dB precision",
                "nearest_finding": self._summary(nearest, (lon, lat)) if nearest else None}

    def threshold_sensitivity(self) -> dict:
        if not (self.dir / "sensitivity.json").is_file():
            return {"error": "No sensitivity results in this bundle."}
        s = self._json("sensitivity.json")
        return {"published_threshold_db": s["published_threshold_db"], "rows": s["rows"]}

    # ---------- UI actions: recorded for the browser, nothing changes here ----------

    def show_on_map(self, finding_id: str | None = None, lon: float | None = None, lat: float | None = None,
                    zoom: float | None = None) -> dict:
        if finding_id:
            f = next((f for f in self.findings if f["properties"]["id"] == finding_id), None)
            if not f:
                return {"error": f"No finding {finding_id}."}
            s = self._summary(f)
            self.actions.append({"type": "map", "finding": finding_id, "lon": s["lon"], "lat": s["lat"], "zoom": zoom or 14.5})
        elif lon is not None and lat is not None:
            self.actions.append({"type": "map", "lon": lon, "lat": lat, "zoom": zoom or 14, "point": True})
        else:
            return {"error": "Give a finding_id, or lon and lat."}
        return {"ok": True, "shown": "the Explore map will move there"}

    def set_map_layer(self, layer: str) -> dict:
        if layer not in LAYERS:
            return {"error": f"layer must be one of {', '.join(LAYERS)}"}
        self.actions.append({"type": "layer", "layer": layer})
        return {"ok": True}

    def open_page(self, page: str) -> dict:
        if page not in PAGES:
            return {"error": f"page must be one of {', '.join(PAGES)}"}
        self.actions.append({"type": "page", "page": page})
        return {"ok": True}

    def download_brief(self, format: str = "csv") -> dict:
        if format not in ("json", "csv", "geojson"):
            return {"error": "format must be json, csv or geojson"}
        self.actions.append({"type": "download", "format": format})
        return {"ok": True, "note": "the browser will download the case brief"}


def _km(a, b) -> float:
    dx = (a[0] - b[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot(dx, (a[1] - b[1]) * 110.57)


_num = {"type": "number"}
DECLARATIONS = [
    {"name": "get_case_overview", "description": "Case facts: place, the two radar dates, areas, how much each plain "
     "category covers, caveats and sources. Call first for any general question.", "parameters": {"type": "object", "properties": {}}},
    {"name": "list_findings", "description": "Areas of observed radar change, largest first, or nearest first when "
     "near_lon/near_lat are given. Filter by plain category or by kind (increase=brighter, decrease=darker).",
     "parameters": {"type": "object", "properties": {
         "category": {"type": "string", "enum": PLAIN_IDS}, "kind": {"type": "string", "enum": ["increase", "decrease"]},
         "near_lon": _num, "near_lat": _num, "limit": {"type": "integer", "description": "1-10, default 5"}}}},
    {"name": "get_finding", "description": "Everything about one finding: plain category, size, HH dB before and after, "
     "quality and its reason, and the highest threshold at which it is still found.",
     "parameters": {"type": "object", "properties": {"finding_id": {"type": "string"}}, "required": ["finding_id"]}},
    {"name": "explain_point", "description": "What happened at one spot (lon, lat): its plain category, HH before/after, "
     "and the nearest finding. Use for the viewer's tapped point.",
     "parameters": {"type": "object", "properties": {"lon": _num, "lat": _num}, "required": ["lon", "lat"]}},
    {"name": "threshold_sensitivity", "description": "How the brighter/darker areas change if the ±3 dB threshold were "
     "2, 4, 5 or 6 dB. Use when asked how sure or robust the result is.", "parameters": {"type": "object", "properties": {}}},
    {"name": "show_on_map", "description": "Move the viewer's Explore map to a finding (selects it) or to a lon/lat "
     "(drops a pin with a plain answer).", "parameters": {"type": "object", "properties": {
         "finding_id": {"type": "string"}, "lon": _num, "lat": _num, "zoom": _num}}},
    {"name": "set_map_layer", "description": "Switch the Explore map layer: plain (what likely happened), change_db "
     "(radar change), before_db, after_db, or quicklook.",
     "parameters": {"type": "object", "properties": {"layer": {"type": "string", "enum": list(LAYERS)}}, "required": ["layer"]}},
    {"name": "open_page", "description": "Open a page of the app for the viewer.",
     "parameters": {"type": "object", "properties": {"page": {"type": "string", "enum": list(PAGES)}}, "required": ["page"]}},
    {"name": "download_brief", "description": "Download the case's findings brief for the viewer.",
     "parameters": {"type": "object", "properties": {"format": {"type": "string", "enum": ["csv", "json", "geojson"]}}}},
]

SYSTEM = """You are the assistant inside "Chattogram, through the clouds", a web app about NASA-ISRO NISAR radar over the
lower Karnaphuli river and Chattogram port, Bangladesh. Two radar passes are compared: 18 June and 16 October 2026.
The people asking may be farmers, students or local officials, not radar experts.

Rules:
- Every number, date, place fact or finding you mention must come from a tool result in this conversation. Never guess one.
- Explain in plain everyday words first; add dB or technical terms only if asked. Keep answers under 120 words unless asked for more.
- The plain categories are likely readings from radar alone, not checked on the ground. Say "likely" and never claim a
  confirmed flood, crop yield, damage or cause. Tide, wet soil and moored boats can look the same to radar.
- When asked what to do or where to check first, give practical next steps: put areas where water likely came or plants
  were likely lost first (largest first, from list_findings), then suggest checking on the ground, telling the union or
  upazila agriculture officer, and keeping the downloaded brief as a dated record. Never promise compensation or aid.
- When the viewer asks you to show, open, switch or download something, do it with the UI tools, then say what you did.
  When they ask "where", also show it on the map.
- If the context has a tapped point or selected finding, "here" or "this" means that.
- Only help with this case and how to read it. For anything else, say briefly that you can only help with this map.
- Reply in {language}."""


# ---------- the loop ----------

COOLDOWN_S = 120  # a model that just failed (busy, hanging, out of quota) is skipped this long while another is left


class Gemini:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.key = settings.gemini_api_key
        self.models = list(dict.fromkeys(m for m in (settings.gemini_model, settings.gemini_fallback_model) if m))
        self.client = httpx.Client(timeout=30, transport=transport)
        self.resting: dict[str, float] = {}  # model -> monotonic time until which it is skipped

    def generate(self, body: dict, deadline: float, start: str | None = None) -> tuple[dict, str]:
        """One model turn. Tries the main model, then the fallback; `start` skips models that already failed in this
        question, and a model that failed in the last COOLDOWN_S is skipped too, so later rounds and later questions go
        straight to the one that answers."""
        if not self.key:
            raise AssistantUnavailable("The assistant isn't set up: add GEMINI_API_KEY to backend/.env and restart the backend.")
        last = ""
        models = self.models[self.models.index(start):] if start in self.models else self.models
        awake = [m for m in models if self.resting.get(m, 0) <= time.monotonic()]
        models = awake or models[-1:]  # all resting: the last one still gets its turn
        for i, model in enumerate(models):
            spare = i < len(models) - 1  # another model is left: give up on this one quickly
            for attempt in range(2 if spare else 3):
                left = deadline - time.monotonic()
                if left < 2:
                    raise AssistantUnavailable("Gemini took too long to answer. Please try again.")
                try:
                    r = self.client.post(GEMINI.format(model=model), json=body, timeout=min(20.0 if spare else 45.0, left),
                                         headers={"x-goog-api-key": self.key.get_secret_value()})
                except httpx.TimeoutException:
                    last = "Gemini took too long to answer. Please try again."
                    continue
                except httpx.HTTPError:
                    last = "Gemini could not be reached."
                else:
                    if r.status_code == 200:
                        return r.json(), model
                    last = _error(r)
                    if r.status_code not in RETRY_STATUS:
                        raise AssistantUnavailable(last)
                    if r.status_code == 429:
                        break  # a quota (often per day) won't lift in seconds: try the next model at once
                time.sleep(min(2 ** attempt, max(0.0, deadline - time.monotonic())))
            if spare:
                self.resting[model] = time.monotonic() + COOLDOWN_S
        raise AssistantUnavailable(last or "Gemini is busy. Please try again in a minute.")


def _error(r: httpx.Response) -> str:
    try:
        status = r.json()["error"].get("status", "")
    except (ValueError, KeyError, AttributeError):
        status = ""
    if r.status_code in (401, 403):
        return "Gemini refused the API key. Check GEMINI_API_KEY in backend/.env."
    if r.status_code == 429:
        return "The Gemini quota is used up for now. Please try again later."
    return f"Gemini is unavailable ({r.status_code} {status}). Please try again in a minute.".replace(" )", ")")


def run(request: ChatRequest, tools: CaseTools, gemini: Gemini):
    """Yields events as they happen: {"type": "step"|"action"|"reply"|"error", ...}. The browser shows each step and
    carries out each action at once, so the map moves while the answer is still being written."""
    ctx = request.context
    context = {"page": ctx.page, "tapped_point_lon_lat": ctx.point, "selected_finding": ctx.finding, "map_layer": ctx.layer}
    # Facts most questions need, given up front so the model doesn't spend a slow round fetching them.
    preloaded = {"case_overview": tools.get_case_overview()}
    if ctx.point:
        preloaded["tapped_point"] = tools.explain_point(*ctx.point)
    if ctx.finding:
        preloaded["selected_finding"] = tools.get_finding(ctx.finding)
    contents = [{"role": m.role, "parts": [{"text": m.text}]} for m in request.messages]
    contents[-1]["parts"].insert(0, {"text": f"[viewer context: {json.dumps({k: v for k, v in context.items() if v})}]\n"
                                             f"[tool results already fetched: {json.dumps(preloaded)}]"})
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM.replace("{language}", "Bangla (Bengali script)" if ctx.lang == "bn" else "English")}]},
        "tools": [{"functionDeclarations": DECLARATIONS}],
        "generationConfig": {"thinkingConfig": {"thinkingLevel": "low"}},
    }
    deadline = time.monotonic() + DEADLINE_S
    model = None
    try:
        for _ in range(MAX_ROUNDS):
            data, model = gemini.generate({**body, "contents": contents}, deadline, model)
            candidate = (data.get("candidates") or [{}])[0]
            content = candidate.get("content") or {"role": "model", "parts": []}
            parts = content.get("parts", [])
            contents.append(content)  # as received: function calls carry thought signatures Gemini needs back
            calls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not calls:
                reply = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                if not reply:
                    reason = candidate.get("finishReason") or (data.get("promptFeedback") or {}).get("blockReason")
                    reply = f"I couldn't answer that ({reason})." if reason and reason != "STOP" else "I couldn't answer that."
                yield {"type": "reply", "text": reply, "model": model}
                return
            answers = []
            for call in calls:
                name, args = call.get("name", ""), call.get("args") or {}
                fn = getattr(tools, name, None) if name in {d["name"] for d in DECLARATIONS} else None
                done = len(tools.actions)
                try:
                    result = fn(**args) if fn else {"error": f"unknown tool {name}"}
                except (TypeError, ValueError) as e:
                    result = {"error": f"bad arguments: {e}"}
                yield {"type": "step", "tool": name, "args": args, "ok": "error" not in result}
                for action in tools.actions[done:]:
                    yield {"type": "action", "action": action}
                answers.append({"functionResponse": {"name": name, "response": result,
                                                     **({"id": call["id"]} if call.get("id") else {})}})
            contents.append({"role": "user", "parts": answers})
        yield {"type": "reply", "text": "That took too many steps. Could you ask in a simpler way?", "model": model}
    except AssistantUnavailable as e:
        yield {"type": "error", "detail": str(e)}


class RateLimit:
    """Requests per minute across all viewers: each answer costs Gemini calls on the owner's key."""

    def __init__(self, per_minute: int):
        self.per_minute, self.hits, self.lock = per_minute, deque(), threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self.lock:
            while self.hits and now - self.hits[0] > 60:
                self.hits.popleft()
            if len(self.hits) >= self.per_minute:
                return False
            self.hits.append(now)
            return True


def router(settings: Settings, transport: httpx.BaseTransport | None = None) -> APIRouter:
    api = APIRouter(prefix="/api/v1/assistant", tags=["Assistant"])
    gemini = Gemini(settings, transport)
    limit = RateLimit(settings.assistant_requests_per_minute)
    case_dir = settings.resolved_data_dir / "cases" / CASE_ID

    @api.get("/status")
    def status():
        return {"available": bool(settings.gemini_api_key) and (case_dir / "manifest.json").is_file(),
                "model": settings.gemini_model}

    @api.post("/chat", response_class=StreamingResponse,
              responses={200: {"content": {"application/x-ndjson": {}}, "description": "One JSON event per line"}})
    def chat(request: ChatRequest):
        # everything that can be refused is refused before the stream starts, as a plain HTTP error
        if request.messages[-1].role != "user":
            raise HTTPException(status_code=422, detail="The last message must be the viewer's.")
        if not settings.gemini_api_key:
            raise HTTPException(status_code=503, detail="The assistant isn't set up: add GEMINI_API_KEY to backend/.env and restart the backend.")
        try:
            tools = CaseTools(case_dir, settings.allow_synthetic_qa)
        except AssistantUnavailable as e:
            raise HTTPException(status_code=503, detail=str(e)) from None
        if not limit.allow():
            raise HTTPException(status_code=429, detail="The assistant is busy. Please wait a minute and try again.")
        lines = (json.dumps(event, ensure_ascii=False) + "\n" for event in run(request, tools, gemini))
        return StreamingResponse(lines, media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})

    return api
