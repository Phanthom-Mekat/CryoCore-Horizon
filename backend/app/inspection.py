"""Bounded, authenticated inspection of real GCOV files; never reads raster pixels."""
import io
from collections import OrderedDict
from urllib.parse import urlsplit

import h5py
import httpx

ORIGIN = "nisar.asf.earthdatacloud.nasa.gov"
HOSTS = {ORIGIN, "d1mv8zhcvry6x4.cloudfront.net"}


class InspectionError(Exception):
    """Safe to display: messages must never contain signed URLs or credentials."""


def main_asset(scene):
    name = scene["granule_id"] + ".h5"
    umm = scene["metadata"]["umm"]
    assets = umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
    asset = next((a for a in assets if a.get("Name") == name), None)
    url = next((u["URL"] for u in scene["urls"]
                if u.get("Type") == "GET DATA" and urlsplit(u.get("URL", "")).path.endswith("/" + name)), None)
    if not asset or not url or not isinstance(asset.get("SizeInBytes"), int):
        raise InspectionError("Main HDF5 asset or byte size missing from CMR.")
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != ORIGIN or parts.port not in (None, 443) or parts.username or parts.password or parts.query:
        raise InspectionError("Main asset is not an approved NASA HTTPS URL.")
    return url, asset


class RemoteFile(io.RawIOBase):
    """Seekable HDF5 reader with a hard network budget and bounded block cache."""
    def __init__(self, client, url, size, token, budget=32 * 1024**2, block_size=256 * 1024):
        self.client, self.url, self.size, self.token = client, url, size, token
        self.budget, self.block_size = budget, block_size
        self.position = self.transferred = self.requests = 0
        self.etag = None
        self.cache = OrderedDict()

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=0):
        pos = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset if whence == 2 else -1
        if pos < 0: raise InspectionError("Invalid file seek.")
        self.position = pos
        return pos

    def _block(self, start):
        if start in self.cache:
            self.cache.move_to_end(start)
            return self.cache[start]
        end = min(start + self.block_size, self.size) - 1
        length = end - start + 1
        if self.transferred + length > self.budget:
            raise InspectionError("Metadata inspection exceeded its download budget.")
        url = self.url
        try:
            for _ in range(5):
                parts = urlsplit(url)
                if parts.scheme != "https" or parts.hostname not in HOSTS or parts.port not in (None, 443) or parts.username or parts.password:
                    raise InspectionError("Unapproved data redirect rejected.")
                headers = {"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"}
                if parts.hostname == ORIGIN:
                    headers["Authorization"] = "Bearer " + self.token
                if self.etag: headers["If-Match"] = self.etag
                with self.client.stream("GET", url, headers=headers, follow_redirects=False) as response:
                    self.requests += 1
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        if not location: raise InspectionError("Data redirect lacks a destination.")
                        url = str(response.url.join(location))
                        continue
                    if response.status_code in (401, 403):
                        raise InspectionError("Earthdata access denied; check token expiry and dataset authorization.")
                    if response.status_code != 206 or response.headers.get("content-range") != f"bytes {start}-{end}/{self.size}":
                        raise InspectionError("Server did not return the exact requested byte range.")
                    etag = response.headers.get("etag")
                    if not etag or (self.etag and etag != self.etag):
                        raise InspectionError("Remote object identity missing or changed during inspection.")
                    self.etag = etag
                    data = bytearray()
                    for chunk in response.iter_raw(chunk_size=65536):
                        self.transferred += len(chunk)
                        if len(data) + len(chunk) > length or self.transferred > self.budget:
                            raise InspectionError("Server exceeded requested byte range.")
                        data.extend(chunk)
                    if len(data) != length: raise InspectionError("Incomplete byte range; retry inspection.")
                    # Reuse the validated signed destination in memory only during this reader's lifetime.
                    self.url = url
                    self.cache[start] = bytes(data)
                    if len(self.cache) > 32: self.cache.popitem(last=False)
                    return bytes(data)
            raise InspectionError("Too many data redirects.")
        except httpx.HTTPError:
            raise InspectionError("NASA transfer failed; retry inspection.") from None

    def read(self, size=-1):
        size = self.size - self.position if size < 0 else min(size, max(0, self.size - self.position))
        if size > self.budget: raise InspectionError("Unbounded HDF5 read rejected.")
        result = bytearray()
        while len(result) < size:
            start = self.position // self.block_size * self.block_size
            block = self._block(start)
            offset = self.position - start
            chunk = block[offset:offset + size - len(result)]
            result.extend(chunk)
            self.position += len(chunk)
        return bytes(result)

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)


def scalar(value):
    if isinstance(value, bytes): return value.decode("utf-8", errors="replace")
    if hasattr(value, "tolist"): return scalar(value.tolist())
    if isinstance(value, (tuple, list)): return [scalar(v) for v in value]
    return value


def inspect(scene, token, client, budget=32 * 1024**2):
    url, asset = main_asset(scene)
    reader = RemoteFile(client, url, asset["SizeInBytes"], token, budget)
    report = {"concept_id": scene["concept_id"], "revision_id": scene["revision_id"],
              "granule_id": scene["granule_id"], "asset_bytes": reader.size,
              "catalog_checksum": asset.get("Checksum"), "full_file_checksum_verified": False,
              "identification": {}, "frequencies": {}, "warnings": [],
              "status": "metadata_inspected", "analysis_ready": False}
    try:
        with h5py.File(reader, "r") as file:
            identification = file.get("/science/LSAR/identification")
            if identification is None: raise InspectionError("NISAR identification group missing.")
            for name, item in identification.items():
                if isinstance(item, h5py.Dataset) and item.size <= 32 and item.dtype.itemsize * item.size <= 4096:
                    report["identification"][name] = scalar(item[()])
            grids = file.get("/science/LSAR/GCOV/grids")
            if grids is None: raise InspectionError("GCOV grids missing; unsupported product.")
            for name in ("frequencyA", "frequencyB"):
                if name not in grids: continue
                group = grids[name]
                layers = {}
                for key, item in group.items():
                    if not isinstance(item, h5py.Dataset): continue
                    info = {"shape": list(item.shape), "dtype": str(item.dtype),
                            "units": scalar(item.attrs.get("units", ""))}
                    if item.size <= 32 and item.dtype.itemsize * item.size <= 4096:
                        info["value"] = scalar(item[()])
                    elif key in ("xCoordinates", "yCoordinates") and item.ndim == 1:
                        info["endpoints"] = [float(item[0]), float(item[-1])]
                    layers[key] = info
                report["frequencies"][name] = layers
            if not report["frequencies"]: raise InspectionError("GCOV frequency grids missing.")
    except (OSError, ValueError, KeyError):
        raise InspectionError("HDF5 metadata could not be inspected.") from None
    report.update(bytes_fetched=reader.transferred, http_requests=reader.requests, etag=reader.etag)
    report["warnings"].append("Metadata only: no raster pixels, valid-mask coverage, pair alignment or change analysis validated.")
    return report
