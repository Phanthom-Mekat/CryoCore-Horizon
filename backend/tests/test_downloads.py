import hashlib
import json
import sqlite3

import httpx
import pytest

from app.database import Database
from app.downloads import asset_lock, download
from app.inspection import InspectionError, ORIGIN


@pytest.fixture
def setup(tmp_path):
    payload = b"abcdefghij"
    scene = {"concept_id": "G-test", "revision_id": 1, "granule_id": "test", "urls": [
        {"Type": "GET DATA", "URL": f"https://{ORIGIN}/test.h5"}], "metadata": {"umm": {"DataGranule": {
            "ArchiveAndDistributionInformation": [{"Name": "test.h5", "SizeInBytes": len(payload),
                "Checksum": {"Algorithm": "MD5", "Value": hashlib.md5(payload).hexdigest()}}]}}}}
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    return scene, db, tmp_path / "downloads", payload


def client_for(payload, calls, fail_at=None):
    def handler(request):
        start, end = map(int, request.headers["range"].split("=")[1].split("-"))
        calls.append(start)
        if start == fail_at: raise httpx.ReadTimeout("signed-url-secret")
        return httpx.Response(206, headers={"content-range": f"bytes {start}-{end}/{len(payload)}", "etag": '"v1"'},
                              stream=httpx.ByteStream(payload[start:end+1]))
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_resume_publish_and_idempotency(setup):
    scene, db, directory, payload = setup
    calls = []
    with client_for(payload, calls) as client:
        first = download(scene, "secret", client, db, directory, 4, block_size=4)
        assert first["status"] == "paused" and first["completed_bytes"] == 4
        assert not list(directory.glob("*.h5"))
        # Simulate crash after writing, but before checkpointing, the next range.
        with next(directory.glob("*.part")).open("ab") as file: file.write(b"garbage")
        result = download(scene, "secret", client, db, directory, 10, block_size=4)
        assert result["status"] == "succeeded" and result["checksum_verified"]
        assert result["sha256"] == hashlib.sha256(payload).hexdigest()
        assert calls == [0, 4, 8]
        download(scene, "secret", client, db, directory, 10, block_size=4)
        assert calls == [0, 4, 8]
        assert next(directory.glob("*.h5")).read_bytes() == payload
        assert not list(directory.glob("*.part"))


def test_interrupted_transfer_resumes_and_sanitizes_error(setup):
    scene, db, directory, payload = setup
    with client_for(payload, [], fail_at=4) as client:
        with pytest.raises(InspectionError, match="NASA transfer failed"):
            download(scene, "secret", client, db, directory, 10, block_size=4)
    report = db.scene_downloads("G-test", 1)[0]
    assert report["status"] == "failed" and report["completed_bytes"] == 4
    assert "secret" not in json.dumps(report)
    calls = []
    with client_for(payload, calls) as client:
        assert download(scene, "secret", client, db, directory, 10, block_size=4)["status"] == "succeeded"
    assert calls == [4, 8]


def test_bad_checksum_never_publishes(setup):
    scene, db, directory, payload = setup
    with client_for(b"x" * len(payload), []) as client:
        with pytest.raises(InspectionError, match="checksum mismatch"):
            download(scene, "secret", client, db, directory, 10, block_size=4)
    assert not list(directory.glob("*.h5"))
    assert db.scene_downloads("G-test", 1)[0]["completed_bytes"] == 0


def test_duplicate_writer_is_rejected(tmp_path):
    with asset_lock(tmp_path / "asset.lock"):
        with pytest.raises(InspectionError, match="another process"):
            with asset_lock(tmp_path / "asset.lock"): pass
    with asset_lock(tmp_path / "asset.lock"): pass


def test_v2_migration_preserves_reports(tmp_path):
    path = tmp_path / "v2.sqlite"
    with sqlite3.connect(path) as connection:
        connection.executescript('CREATE TABLE inspections (concept_id TEXT, revision_id INTEGER, inspected_at TEXT, payload TEXT); PRAGMA user_version=2;')
        connection.execute("INSERT INTO inspections VALUES ('old',1,'now','{}')")
    db = Database(path)
    db.initialize()
    db.initialize()
    assert db.get_inspection("old", 1) == {}
    with db.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 3
