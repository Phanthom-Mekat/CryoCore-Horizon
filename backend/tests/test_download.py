import hashlib
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.download import DownloadError, _auth_headers, credentials, download, is_allowed_host

DATA = bytes(range(256)) * 400  # 100 KiB of test bytes, generated here; not NISAR data
MD5 = hashlib.md5(DATA).hexdigest()
URL = "https://nisar.asf.earthdatacloud.nasa.gov/NISAR/C/G/G.h5"
S3 = "https://nisar-bucket.s3.us-west-2.amazonaws.com/G.h5?X-Amz-Signature=secret"


class Broken(httpx.SyncByteStream):
    def __iter__(self):
        yield DATA[:40000]
        raise httpx.ReadError("connection reset")


def server(log):
    def handle(request: httpx.Request):
        log.append((request.url.host, request.headers.get("authorization"), request.headers.get("range")))
        if request.url.host.endswith("earthdatacloud.nasa.gov"):
            assert request.headers["authorization"] == "Bearer tok"
            return httpx.Response(307, headers={"location": S3})
        assert "authorization" not in request.headers  # never forwarded to S3
        if request.headers.get("range"):
            start = int(request.headers["range"].split("=")[1].rstrip("-"))
            return httpx.Response(206, content=DATA[start:], headers={
                "content-range": f"bytes {start}-{len(DATA) - 1}/{len(DATA)}", "content-type": "application/x-hdf5"})
        return httpx.Response(200, stream=Broken(), headers={"content-type": "application/x-hdf5"})
    return handle


def test_interrupted_download_resumes_with_range_and_verifies(tmp_path):
    log, dest = [], tmp_path / "G.h5"
    with httpx.Client(transport=httpx.MockTransport(server(log))) as client:
        with pytest.raises(DownloadError) as err:
            download(client, URL, dest, ("bearer", "tok"), len(DATA), MD5)
        assert err.value.code == "network" and err.value.retryable
        assert "secret" not in str(err.value) and "tok" not in str(err.value)
        part = tmp_path / "G.h5.part"
        assert part.stat().st_size == 40000 and not dest.exists()

        seen = []
        result = download(client, URL, dest, ("bearer", "tok"), len(DATA), MD5, lambda done, total: seen.append(done))
    assert result == {"size_bytes": len(DATA), "md5": MD5, "reused": False}
    assert dest.read_bytes() == DATA and not part.exists()
    assert log[-1][2] == "bytes=40000-" and seen[-1] == len(DATA)

    # Already complete and verified: reused without any request.
    def no_network(request):
        pytest.fail("should not download again")
    with httpx.Client(transport=httpx.MockTransport(no_network)) as client:
        assert download(client, URL, dest, None, len(DATA), MD5)["reused"] is True


def test_missing_credentials_fail_before_network(tmp_path):
    def no_network(request):
        pytest.fail("no request without credentials")
    with httpx.Client(transport=httpx.MockTransport(no_network)) as client, pytest.raises(DownloadError) as err:
        download(client, URL, tmp_path / "G.h5", None, len(DATA), MD5)
    assert err.value.code == "needs_credentials" and not err.value.retryable
    assert "CRYO_EARTHDATA_TOKEN" in str(err.value) and "Generate Token" in str(err.value)


@pytest.mark.parametrize("response, code", [
    (httpx.Response(302, headers={"location": "https://evil.example.com/x"}), "disallowed_host"),
    (httpx.Response(302, headers={"location": "http://urs.earthdata.nasa.gov/x"}), "disallowed_host"),
    (httpx.Response(401), "needs_credentials"),
    (httpx.Response(200, text="<html>login</html>", headers={"content-type": "text/html"}), "needs_credentials"),
    (httpx.Response(200, content=b"x" * len(DATA)), "checksum_mismatch"),
    (httpx.Response(503), "http_error"),
])
def test_refusals(tmp_path, response, code):
    requests = []

    def handle(request):
        requests.append(request)
        return response
    with httpx.Client(transport=httpx.MockTransport(handle)) as client, pytest.raises(DownloadError) as err:
        download(client, URL, tmp_path / "G.h5", ("bearer", "tok"), len(DATA), MD5)
    assert err.value.code == code
    assert all(r.url.host.endswith("nasa.gov") for r in requests)
    assert not (tmp_path / "G.h5").exists()
    if code == "checksum_mismatch":
        assert not (tmp_path / "G.h5.part").exists()


def test_disk_space_is_checked_first(tmp_path):
    def no_network(request):
        pytest.fail("no request when the disk is too small")
    with httpx.Client(transport=httpx.MockTransport(no_network)) as client, pytest.raises(DownloadError) as err:
        download(client, URL, tmp_path / "G.h5", ("bearer", "tok"), 10**18, None)
    assert err.value.code == "insufficient_disk"


def test_authorization_only_reaches_earthdata_hosts():
    bearer, basic = ("bearer", "tok"), ("basic", ("user", "pw"))
    assert _auth_headers(bearer, "nisar.asf.earthdatacloud.nasa.gov") == {"Authorization": "Bearer tok"}
    assert _auth_headers(bearer, "urs.earthdata.nasa.gov")
    assert _auth_headers(basic, "urs.earthdata.nasa.gov")["Authorization"].startswith("Basic ")
    for host in ("nisar.asf.earthdatacloud.nasa.gov", "x.s3.us-west-2.amazonaws.com", "datapool.asf.alaska.edu"):
        assert _auth_headers(basic, host) == {}  # a password only goes to URS
    assert _auth_headers(bearer, "x.s3.us-west-2.amazonaws.com") == {}
    assert is_allowed_host("bucket.s3.us-west-2.amazonaws.com") and is_allowed_host("datapool.asf.alaska.edu")
    assert not is_allowed_host("s3.amazonaws.com.evil.com") and not is_allowed_host("earthdatacloud.nasa.gov.evil.com")


def test_credentials_from_token_or_netrc(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    assert credentials(Settings(_env_file=None)) is None
    (tmp_path / ".netrc").write_text("machine urs.earthdata.nasa.gov login alice password s3cret\n")
    assert credentials(Settings(_env_file=None)) == ("basic", ("alice", "s3cret"))
    assert credentials(Settings(earthdata_token=" tok ", _env_file=None)) == ("bearer", "tok")
