"""Resumable operator downloads with durable checkpoints and verified publication."""
import hashlib
import json
import os
import re
import shutil
from contextlib import contextmanager
from datetime import datetime, timezone

from .inspection import InspectionError, RemoteFile, main_asset

BLOCK = 4 * 1024**2


@contextmanager
def asset_lock(path):
    # OS locks are released even on a killed process; lock-file presence is not ownership.
    with path.open("a+b") as file:
        if file.tell() == 0:
            file.write(b"0")
            file.flush()
        file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise InspectionError("This asset is already being downloaded by another process.") from None
        try:
            yield
        finally:
            file.seek(0)
            if os.name == "nt":
                msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(file.fileno(), fcntl.LOCK_UN)


def checksums(path):
    md5, sha256 = hashlib.md5(usedforsecurity=False), hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(BLOCK):
            md5.update(block)
            sha256.update(block)
    return md5.hexdigest(), sha256.hexdigest()


def download(scene, token, client, database, directory, max_bytes, block_size=BLOCK):
    url, asset = main_asset(scene)
    checksum = asset.get("Checksum", {})
    expected = checksum.get("Value", "").lower()
    if checksum.get("Algorithm", "").upper() != "MD5" or not re.fullmatch("[0-9a-f]{32}", expected):
        raise InspectionError("A valid catalog MD5 checksum is required before downloading.")
    if asset["SizeInBytes"] <= 0 or max_bytes <= 0:
        raise InspectionError("Asset size and transfer budget must be positive.")
    identity = {"concept_id": scene["concept_id"], "revision_id": scene["revision_id"],
                "granule_id": scene["granule_id"], "total_bytes": asset["SizeInBytes"], "expected_md5": expected}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    partial, final = directory / (key + ".part"), directory / (key + ".h5")
    with asset_lock(directory / (key + ".lock")):
        report = database.get_download(key) or {**identity, "asset_id": key, "completed_bytes": 0,
                                               "etag": None, "attempts": 0, "checksum_verified": False}

        def save(status, error=None):
            report.update(status=status, error=error, updated_at=datetime.now(timezone.utc).isoformat())
            database.save_download(report)

        report["attempts"] += 1
        save("running")
        try:
            # Recover a crash between atomic rename and DB success; verify on every reuse.
            if final.exists():
                md5, sha256 = checksums(final)
                if final.stat().st_size != identity["total_bytes"] or md5 != expected:
                    report["checksum_verified"] = False
                    raise InspectionError("Published asset failed integrity verification; move it aside before retrying.")
                report.update(completed_bytes=identity["total_bytes"], checksum_verified=True, sha256=sha256)
                save("succeeded")
                return report
            report["checksum_verified"] = False
            if not partial.exists():
                report.update(completed_bytes=0, etag=None)
            offset = report["completed_bytes"]
            if partial.exists() and partial.stat().st_size < offset:
                raise InspectionError("Partial file is shorter than its checkpoint; restore or remove it before retrying.")
            remaining = identity["total_bytes"] - offset
            if shutil.disk_usage(directory).free < min(remaining, max_bytes) + 64 * 1024**2:
                raise InspectionError("Insufficient disk space for this transfer budget.")
            reader = RemoteFile(client, url, identity["total_bytes"], token,
                                budget=max_bytes, block_size=block_size)
            reader.etag = report["etag"]
            with partial.open("r+b" if partial.exists() else "w+b") as target:
                # Uncheckpointed bytes after a crash are discarded and safely fetched again.
                target.truncate(offset)
                target.seek(offset)
                while offset < identity["total_bytes"]:
                    length = min(block_size, identity["total_bytes"] - offset)
                    if reader.transferred + length > max_bytes:
                        save("paused")
                        return report
                    data = reader._block(offset)
                    target.write(data)
                    target.flush()
                    os.fsync(target.fileno())
                    offset += len(data)
                    report.update(completed_bytes=offset, etag=reader.etag)
                    save("running")
                    reader.cache.clear()
            md5, sha256 = checksums(partial)
            if md5 != expected:
                # Invalid bytes cannot ever be resumed or published as a verified asset.
                partial.unlink()
                report.update(completed_bytes=0, etag=None)
                raise InspectionError("Downloaded file checksum mismatch; retry starts from zero.")
            os.replace(partial, final)
            report.update(checksum_verified=True, sha256=sha256)
            save("succeeded")
            return report
        except (InspectionError, OSError, KeyboardInterrupt) as exc:
            message = str(exc) if isinstance(exc, InspectionError) else "Transfer interrupted or local I/O failed; rerun to resume."
            save("failed", message)
            raise InspectionError(message) from None
