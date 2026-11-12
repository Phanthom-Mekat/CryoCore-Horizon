import io

import h5py
import httpx
import pytest

from app.database import Database
from app.inspection import ORIGIN, InspectionError, RemoteFile, inspect, main_asset


URL = f"https://{ORIGIN}/NISAR/test.h5"


def test_redirect_does_not_forward_token():
    def handler(request):
        if request.url.host == ORIGIN:
            assert request.headers["authorization"] == "Bearer secret"
            return httpx.Response(303, headers={"location": "https://d1mv8zhcvry6x4.cloudfront.net/test?signature=private"})
        assert "authorization" not in request.headers
        return httpx.Response(206, headers={"content-range": "bytes 0-3/4", "etag": '"v1"'}, stream=httpx.ByteStream(b"test"))
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        reader = RemoteFile(client, URL, 4, "secret")
        assert reader.read(4) == b"test"
        reader.seek(0)
        assert reader.read(4) == b"test"
        assert reader.transferred == 4


@pytest.mark.parametrize("response", [
    httpx.Response(200, content=b"ignored range"),
    httpx.Response(303, headers={"location": "https://evil.example/data"}),
    httpx.Response(206, headers={"content-range": "bytes 0-3/4", "etag": "v1"}, stream=httpx.ByteStream(b"bad")),
    httpx.Response(403),
])
def test_unsafe_or_incomplete_response_rejected(response):
    with httpx.Client(transport=httpx.MockTransport(lambda _: response)) as client:
        with pytest.raises(InspectionError):
            RemoteFile(client, URL, 4, "secret").read(4)


def test_budget_and_object_change():
    def handler(request):
        start = int(request.headers["range"].split("=")[1].split("-")[0])
        return httpx.Response(206, headers={"content-range": f"bytes {start}-{start+3}/8", "etag": str(start)}, stream=httpx.ByteStream(b"test"))
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        reader = RemoteFile(client, URL, 8, "secret", budget=4, block_size=4)
        reader.read(4)
        with pytest.raises(InspectionError, match="budget"): reader.read(4)
        reader = RemoteFile(client, URL, 8, "secret", block_size=4)
        reader.read(4)
        with pytest.raises(InspectionError, match="identity"): reader.read(4)


def test_real_hdf5_structure_and_revision_persistence(tmp_path):
    buffer = io.BytesIO()
    with h5py.File(buffer, "w") as file:
        file.create_dataset("science/LSAR/identification/trackNumber", data=163)
        group = file.create_group("science/LSAR/GCOV/grids/frequencyA")
        group.create_dataset("HHHH", shape=(200, 300), dtype="f4")
        group.create_dataset("projection", data=32646)
    payload = buffer.getvalue()
    scene = {"concept_id": "test", "revision_id": 1, "granule_id": "test", "urls": [{"URL": URL, "Type": "GET DATA"}],
             "metadata": {"umm": {"DataGranule": {"ArchiveAndDistributionInformation": [{"Name": "test.h5", "SizeInBytes": len(payload)}]}}}}
    def handler(request):
        start, end = map(int, request.headers["range"].split("=")[1].split("-"))
        return httpx.Response(206, headers={"content-range": f"bytes {start}-{end}/{len(payload)}", "etag": "v1"}, stream=httpx.ByteStream(payload[start:end+1]))
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = inspect(scene, "secret", client)
    assert report["frequencies"]["frequencyA"]["HHHH"]["shape"] == [200, 300]
    assert not report["analysis_ready"]
    report["inspected_at"] = "2026-11-12T00:00:00Z"
    db = Database(tmp_path / "test.sqlite")
    db.initialize()
    db.save_inspection(report)
    db.initialize()
    assert db.get_inspection("test", 1) == report
    assert db.get_inspection("test", 2) is None
    scene["urls"][0]["URL"] = "https://evil.example/test.h5"
    with pytest.raises(InspectionError): main_asset(scene)
