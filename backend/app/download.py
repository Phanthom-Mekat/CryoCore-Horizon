"""Authenticated, resumable NISAR downloads from NASA Earthdata / ASF.

Credentials come from EARTHDATA_TOKEN (bearer) or ~/.netrc / ~/_netrc (machine urs.earthdata.nasa.gov).
Redirects are followed by hand so every hop is checked against an allowlist, and Authorization is only ever
sent to Earthdata Login (URS) or *.earthdatacloud.nasa.gov, never to the S3 host that serves the bytes.
Nothing here logs headers, URLs with query strings, or credentials.
"""
import base64
import hashlib
import netrc
import os
import re
import shutil
from pathlib import Path

import httpx

from .config import Settings

URS = "urs.earthdata.nasa.gov"
TOKEN_HELP = ("Add EARTHDATA_TOKEN=<token> to backend/.env (generate one at https://urs.earthdata.nasa.gov/ "
              "-> Generate Token), or add 'machine urs.earthdata.nasa.gov login <user> password <pass>' to ~/.netrc, "
              "then queue the job again.")
_S3 = re.compile(r"([a-z0-9.-]+\.)?s3([.-][a-z0-9-]+)*\.amazonaws\.com")
DISK_MARGIN = 512 * 1024**2
CHUNK = 1024**2


class DownloadError(Exception):
    def __init__(self, code: str, message: str, retryable: bool):
        super().__init__(message)
        self.code, self.retryable = code, retryable


def needs_credentials(detail: str) -> DownloadError:
    return DownloadError("needs_credentials", f"{detail} {TOKEN_HELP}", retryable=False)


def credentials(settings: Settings):
    """('bearer', token) | ('basic', (login, password)) | None."""
    if settings.earthdata_token and settings.earthdata_token.get_secret_value().strip():
        return "bearer", settings.earthdata_token.get_secret_value().strip()
    for name in (".netrc", "_netrc"):
        path = Path.home() / name
        if path.is_file():
            try:
                entry = netrc.netrc(path).authenticators(URS)
            except (netrc.NetrcParseError, OSError):
                continue
            if entry and entry[0] and entry[2]:
                return "basic", (entry[0], entry[2])
    return None


def is_auth_host(host: str) -> bool:
    return host == URS or host.endswith(".earthdatacloud.nasa.gov")


def is_allowed_host(host: str) -> bool:
    return is_auth_host(host) or host.endswith(".asf.alaska.edu") or bool(_S3.fullmatch(host))


def _auth_headers(auth, host: str) -> dict:
    if auth is None or not is_auth_host(host):
        return {}
    kind, value = auth
    if kind == "bearer":
        return {"Authorization": f"Bearer {value}"}
    if host == URS:  # a password only ever goes to the login service itself
        return {"Authorization": "Basic " + base64.b64encode(":".join(value).encode()).decode()}
    return {}


def file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as f:
        while chunk := f.read(8 * CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _verified(path: Path, size: int | None, md5: str | None) -> bool:
    return path.is_file() and (size is None or path.stat().st_size == size) and (md5 is None or file_md5(path) == md5.lower())


def download(client: httpx.Client, url: str, dest: Path, auth, size: int | None = None,
             md5: str | None = None, progress=None) -> dict:
    """Download url to dest via dest.part, resuming with Range. Returns {"size_bytes", "md5"}."""
    if _verified(dest, size, md5):
        return {"size_bytes": dest.stat().st_size, "md5": md5 or file_md5(dest), "reused": True}
    if auth is None:
        raise needs_credentials("NISAR downloads need NASA Earthdata Login credentials, and none are configured.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    if size is not None and have > size:
        part.unlink()
        have = 0
    if size is not None:
        free = shutil.disk_usage(dest.parent).free
        if free < size - have + DISK_MARGIN:
            raise DownloadError("insufficient_disk", f"Needs {(size - have) / 1e9:.1f} GB plus margin; "
                                f"only {free / 1e9:.1f} GB free on the data disk.", retryable=False)

    current = httpx.URL(url)
    for _ in range(10):
        if current.scheme != "https" or not is_allowed_host(current.host):
            raise DownloadError("disallowed_host", f"Refused to contact {current.host!r}: not an allowed NASA/ASF host.",
                                retryable=False)
        headers = _auth_headers(auth, current.host)
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            with client.stream("GET", current, headers=headers, follow_redirects=False) as response:
                if response.is_redirect:
                    current = current.join(response.headers["location"])
                    continue
                if response.status_code in (401, 403):
                    raise needs_credentials(f"Earthdata refused the credentials ({response.status_code} from "
                                            f"{current.host}); check the token and that the ASF data EULA is accepted.")
                if response.status_code == 416 and size is not None and have == size:
                    break  # the .part is already complete
                if response.status_code not in (200, 206):
                    raise DownloadError("http_error", f"{current.host} returned HTTP {response.status_code}.",
                                        retryable=response.status_code >= 500 or response.status_code == 429)
                if "text/html" in response.headers.get("content-type", ""):
                    raise needs_credentials(f"{current.host} returned a login page instead of the file.")
                if response.status_code == 200 or not response.headers.get("content-range", "").startswith(f"bytes {have}-"):
                    have = 0  # server ignored the Range: start over
                with part.open("ab" if have else "wb") as out:
                    for chunk in response.iter_bytes():  # unbuffered, so an interruption keeps every byte received
                        out.write(chunk)
                        have += len(chunk)
                        if progress:
                            progress(have, size)
                break
        except httpx.HTTPError as exc:
            # The .part stays on disk, so the next attempt resumes from here.
            raise DownloadError("network", f"Download from {current.host} interrupted ({type(exc).__name__}); "
                                "it will resume on retry.", retryable=True) from exc
    else:
        raise DownloadError("too_many_redirects", "Too many redirects.", retryable=False)

    got = part.stat().st_size
    if size is not None and got != size:
        if got > size:
            part.unlink()
        raise DownloadError("size_mismatch", f"Got {got} bytes, catalog says {size}.", retryable=True)
    digest = file_md5(part)
    if md5 is not None and digest != md5.lower():
        part.unlink()
        raise DownloadError("checksum_mismatch", "MD5 does not match the NASA catalog; the file was discarded.",
                            retryable=True)
    os.replace(part, dest)
    return {"size_bytes": got, "md5": digest, "reused": False}


def h5_source(scene: dict) -> dict:
    """The HDF5 data URL, name, size and MD5 from a stored CMR scene (UMM DataGranule)."""
    umm = scene["metadata"]["umm"]
    files = umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
    info = next((f for f in files if f.get("Name", "").endswith(".h5") and "QA" not in f["Name"]), {})
    url = next((u["URL"] for u in scene["urls"] if u.get("URL", "").startswith("https://")
                and u["URL"].endswith("/" + info.get("Name", "\0"))), None)
    if url is None:
        url = next((u["URL"] for u in scene["urls"] if u.get("Type") == "GET DATA"
                    and u.get("URL", "").startswith("https://") and u["URL"].endswith(".h5")), None)
    checksum = info.get("Checksum") or {}
    return {"url": url, "name": info.get("Name") or (url.rsplit("/", 1)[-1] if url else None),
            "size_bytes": info.get("SizeInBytes"),
            "md5": checksum.get("Value") if checksum.get("Algorithm") == "MD5" else None}
