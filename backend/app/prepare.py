"""Operator CLI: bounded inspection, never an unauthenticated HTTP download job."""
import argparse
import json
from datetime import datetime, timezone

import httpx

from .config import Settings
from .database import Database
from .downloads import download
from .inspection import InspectionError, inspect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("concept_id", help="GCOV scene already in the local CMR catalog")
    parser.add_argument("--budget-mib", type=int, default=32, choices=range(1, 129), metavar="1..128")
    parser.add_argument("--download", action="store_true", help="Download/resume the full asset instead of inspecting metadata")
    parser.add_argument("--transfer-mib", type=int, default=64, help="Download budget per invocation (default 64 MiB; minimum 4)")
    args = parser.parse_args()
    if args.transfer_mib < 4:
        parser.error("--transfer-mib must be at least 4")
    settings = Settings()
    if not settings.earthdata_token:
        parser.exit(1, "Set EARTHDATA_TOKEN in backend/.env.\n")
    database = Database(settings.resolved_database_path)
    database.initialize()
    scene = database.get_scene(args.concept_id)
    if not scene or scene["product"] != "GCOV":
        parser.exit(1, "GCOV scene not found in the local catalog.\n")
    try:
        with httpx.Client(timeout=settings.nasa_timeout_seconds, follow_redirects=False) as client:
            if args.download:
                report = download(scene, settings.earthdata_token.get_secret_value(), client, database,
                                  settings.resolved_download_directory, args.transfer_mib * 1024**2)
            else:
                report = inspect(scene, settings.earthdata_token.get_secret_value(), client, args.budget_mib * 1024**2)
                report["inspected_at"] = datetime.now(timezone.utc).isoformat()
                database.save_inspection(report)
    except InspectionError as exc:
        parser.exit(1, str(exc) + "\n")
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
