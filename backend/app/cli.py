"""Operator commands. Run from backend/:

    python -m app.cli sync --start 2026-01-01 [--end YYYY-MM-DD] [--product GCOV]
    python -m app.cli prepare-case karnaphuli-estuary
    python -m app.cli migrate
"""
import argparse
import sys
from datetime import date

import httpx

from .config import Settings
from .database import Database
from .nasa import CMR_URL, CatalogError, NasaCatalog
from .schemas import SearchRequest


def sync(database: Database, settings: Settings, start: date, end: date, product: str,
         transport: httpx.BaseTransport | None = None) -> int:
    """Page the public NASA CMR search into SQLite. No credentials needed."""
    stored = 0
    with httpx.Client(base_url=CMR_URL, timeout=settings.nasa_timeout_seconds, transport=transport,
                      headers={"User-Agent": "CryoCore-Horizon/0.1"}) as client:
        catalog, page = NasaCatalog(client), 1
        while True:
            query = SearchRequest(start_date=start, end_date=end, product=product, page_size=100, page=page)
            scenes, hits, now = catalog.search(query)
            database.save_search(query, scenes, hits, now)
            stored += len(scenes)
            print(f"page {page}: {len(scenes)} scenes ({stored}/{hits})")
            if not scenes or page * query.page_size >= hits:
                return stored
            page += 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    s = commands.add_parser("sync", help="Page NASA CMR NISAR metadata into the local catalog")
    s.add_argument("--start", type=date.fromisoformat, required=True)
    s.add_argument("--end", type=date.fromisoformat, default=date.today())
    s.add_argument("--product", choices=["GCOV", "GUNW", "GOFF"], default="GCOV")
    p = commands.add_parser("prepare-case", help="Queue a case job and run it now in this process")
    p.add_argument("case_id")
    commands.add_parser("migrate", help="Apply database migrations")
    args = parser.parse_args(argv)

    settings = Settings()
    database = Database(settings.resolved_database_path)
    database.initialize()
    if args.command == "migrate":
        print(f"schema v{database.schema_version()}")
    elif args.command == "sync":
        try:
            print(f"stored {sync(database, settings, args.start, args.end, args.product)} scenes")
        except CatalogError as exc:
            print(f"sync failed: {exc}", file=sys.stderr)
            return 1
    elif args.command == "prepare-case":
        from .jobs import enqueue
        from .worker import run_job
        try:
            job_id = enqueue(database, args.case_id)
        except KeyError:
            print(f"unknown case: {args.case_id}", file=sys.stderr)
            return 2
        job = run_job(database, settings, job_id)
        print(f"job {job['id']}: {job['state']} ({job['stage']})" + (f": {job['error']}" if job["error"] else ""))
        return 0 if job["state"] == "succeeded" else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
