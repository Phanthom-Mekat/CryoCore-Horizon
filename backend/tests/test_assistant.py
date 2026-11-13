import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Database
from app.main import create_app

CASE = "karnaphuli-estuary"
KEY = "test-gemini-key"


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr("app.assistant.time.sleep", lambda s: None)  # retries without waiting
    return Settings(database_path=tmp_path / "db.sqlite3", data_dir=tmp_path / "data", admin_token="admin-secret",
                    gemini_api_key=KEY, allow_synthetic_qa=True, job_max_attempts=2, _env_file=None)


@pytest.fixture
def published(settings):
    """A real pipeline run on synthetic fixtures (served only because the settings allow QA data)."""
    from qa_synthetic_case import publish_synthetic

    db = Database(settings.resolved_database_path)
    db.initialize()
    assert publish_synthetic(db, settings)["state"] == "succeeded"
    return json.loads((settings.resolved_data_dir / "cases" / CASE / "findings.geojson").read_text())["features"]


def gemini(*replies):
    """A fake Gemini: answers with `replies` in order and records every request body and header."""
    seen, queue = [], list(replies)

    def handle(request: httpx.Request):
        seen.append({"body": json.loads(request.content), "key": request.headers.get("x-goog-api-key"),
                     "model": request.url.path.split("/")[-1].split(":")[0]})
        status, body = queue.pop(0)
        return httpx.Response(status, json=body)

    return httpx.MockTransport(handle), seen


def call(name, args, id_="call_1"):
    return 200, {"candidates": [{"content": {"role": "model", "parts": [
        {"functionCall": {"name": name, "args": args, "id": id_}, "thoughtSignature": "sig-" + id_}]}}]}


def text(t):
    return 200, {"candidates": [{"content": {"role": "model", "parts": [{"text": t}]}, "finishReason": "STOP"}]}


def ask(settings, transport, message="Show me the biggest change", **context):
    with TestClient(create_app(settings, gemini_transport=transport)) as client:
        return client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": message}],
                                                           "context": {"lang": "en", **context}})


def events(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(line) for line in response.text.splitlines()]


def test_tools_run_actions_return_and_signatures_go_back(settings, published):
    biggest = max(published, key=lambda f: f["properties"]["area_km2"])["properties"]["id"]
    transport, seen = gemini(call("list_findings", {"limit": 1}), call("show_on_map", {"finding_id": biggest}, "call_2"),
                             text("Here is the largest change."))
    r = ask(settings, transport, point=[91.82, 22.30])
    out = events(r)
    assert [e["type"] for e in out] == ["step", "step", "action", "reply"]  # the action streams before the reply
    assert out[-1] == {"type": "reply", "text": "Here is the largest change.", "model": "gemini-3.5-flash"}
    assert [e["tool"] for e in out if e["type"] == "step"] == ["list_findings", "show_on_map"]
    assert all(e["ok"] for e in out if e["type"] == "step")
    action = out[2]["action"]
    assert action == {"type": "map", "finding": biggest, "lon": action["lon"], "lat": action["lat"], "zoom": 14.5}
    assert all(s["key"] == KEY for s in seen) and KEY not in r.text
    second = seen[1]["body"]["contents"]
    first_text = second[0]["parts"][0]["text"]
    assert first_text.startswith("[viewer context:") and "91.82" in first_text
    assert '"case_overview"' in first_text and '"tapped_point"' in first_text  # preloaded, saving a round
    assert second[1]["parts"][0]["thoughtSignature"] == "sig-call_1"  # the model turn goes back as received
    response = second[2]["parts"][0]["functionResponse"]
    assert response["id"] == "call_1" and response["response"]["findings"][0]["id"] == biggest


def test_explain_point_reads_the_plain_layer(settings, published):
    transport, seen = gemini(call("explain_point", {"lon": 91.82, "lat": 22.30}), call("explain_point", {"lon": 91.0, "lat": 22.3}, "c2"),
                             text("ok"))
    assert ask(settings, transport).status_code == 200
    inside = seen[1]["body"]["contents"][2]["parts"][0]["functionResponse"]["response"]
    outside = seen[2]["body"]["contents"][4]["parts"][0]["functionResponse"]["response"]
    assert inside["inside_analysis_area"] and inside["plain"] in {"plants_grew", "object", "water_went", "surface"}
    assert inside["hh_after_db_display"] > inside["hh_before_db_display"]  # the planted +8 dB brightening
    assert outside == {"inside_analysis_area": False}


def test_bad_tool_calls_become_errors_the_model_sees(settings, published):
    transport, seen = gemini(call("open_page", {"page": "admin"}), call("delete_everything", {}, "c2"), text("Sorry."))
    out = events(ask(settings, transport))
    assert [e["ok"] for e in out if e["type"] == "step"] == [False, False] and not [e for e in out if e["type"] == "action"]
    assert "page must be one of" in seen[1]["body"]["contents"][2]["parts"][0]["functionResponse"]["response"]["error"]


def test_busy_model_is_retried_then_falls_back(settings, published):
    busy = (503, {"error": {"code": 503, "status": "UNAVAILABLE"}})
    transport, seen = gemini(busy, busy, text("From the fallback."))
    fallback = settings.model_copy(update={"gemini_fallback_model": "gemini-3.8-flash"})
    out = events(ask(fallback, transport))
    assert out == [{"type": "reply", "text": "From the fallback.", "model": "gemini-3.8-flash"}]
    assert [s["model"] for s in seen] == ["gemini-3.5-flash"] * 2 + ["gemini-3.8-flash"]  # 2 tries, then switch


def test_after_a_fallback_later_rounds_stay_on_it(settings, published):
    busy = (503, {"error": {"code": 503, "status": "UNAVAILABLE"}})
    transport, seen = gemini(busy, busy, call("get_case_overview", {}), text("Done."))
    fallback = settings.model_copy(update={"gemini_fallback_model": "gemini-3.8-flash"})
    assert events(ask(fallback, transport))[-1]["model"] == "gemini-3.8-flash"
    assert [s["model"] for s in seen] == ["gemini-3.5-flash"] * 2 + ["gemini-3.8-flash"] * 2


def test_refusals_are_plain_and_never_leak_the_key(settings, published):
    transport, _ = gemini((403, {"error": {"status": "PERMISSION_DENIED", "message": f"key {KEY} invalid"}}))
    r = ask(settings, transport)
    out = events(r)  # refused mid-stream: an error event, never the upstream message
    assert out == [{"type": "error", "detail": "Gemini refused the API key. Check GEMINI_API_KEY in backend/.env."}]
    assert KEY not in r.text
    no_key = settings.model_copy(update={"gemini_api_key": None})
    r = ask(no_key, gemini()[0])
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_synthetic_bundle_is_not_answered_from_unless_qa(settings, published):
    real = settings.model_copy(update={"allow_synthetic_qa": False})
    r = ask(real, gemini(text("never"))[0])
    assert r.status_code == 503 and "isn't processed" in r.json()["detail"]


def test_input_limits_and_rate_limit(settings, published):
    with TestClient(create_app(settings.model_copy(update={"assistant_requests_per_minute": 1}),
                               gemini_transport=gemini(text("one"), text("two"))[0])) as client:
        assert client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": "x" * 4001}]}).status_code == 422
        assert client.post("/api/v1/assistant/chat", json={"messages": []}).status_code == 422
        assert client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": "hi"}]}).status_code == 200
        assert client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": "hi"}]}).status_code == 429


def test_quota_skips_straight_to_the_fallback(settings, published):
    quota = (429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})
    transport, seen = gemini(quota, text("From the fallback."))
    fallback = settings.model_copy(update={"gemini_fallback_model": "gemini-3.8-flash"})
    assert events(ask(fallback, transport))[-1]["model"] == "gemini-3.8-flash"
    assert [s["model"] for s in seen] == ["gemini-3.5-flash", "gemini-3.8-flash"]  # no retries on a quota


def test_a_failed_main_model_rests_so_the_next_question_goes_straight_to_the_fallback(settings, published):
    busy = (503, {"error": {"code": 503, "status": "UNAVAILABLE"}})
    transport, seen = gemini(busy, busy, text("first"), text("second"))
    assert settings.gemini_fallback_model == "gemini-3.8-flash"  # on by default
    with TestClient(create_app(settings, gemini_transport=transport)) as client:
        for _ in range(2):
            r = client.post("/api/v1/assistant/chat", json={"messages": [{"role": "user", "text": "hi"}]})
            assert events(r)[-1]["type"] == "reply"
    assert [s["model"] for s in seen] == ["gemini-3.5-flash"] * 2 + ["gemini-3.8-flash"] * 2


def test_a_hanging_model_times_out_and_falls_back(settings, published):
    def handle(request: httpx.Request):
        if "gemini-3.5-flash" in request.url.path:
            raise httpx.ReadTimeout("hung", request=request)
        return httpx.Response(200, json=text("from 3.8")[1])

    out = events(ask(settings, httpx.MockTransport(handle)))
    assert out == [{"type": "reply", "text": "from 3.8", "model": "gemini-3.8-flash"}]
