import json

from app.cases import list_cases, read_case


def test_only_published_case_ids_are_visible(tmp_path):
    stage = tmp_path / ".staging-test"
    stage.mkdir()
    (stage / "manifest.json").write_text('{"status":"incomplete"}', encoding="utf-8")
    assert list_cases(tmp_path) == []
    assert read_case(tmp_path, "../.staging-test") is None
    assert read_case(tmp_path, "a" * 24) is None
    published = tmp_path / ("a" * 24)
    published.mkdir()
    manifest = {"id": published.name, "assets": []}
    (published / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert list_cases(tmp_path) == [manifest]
