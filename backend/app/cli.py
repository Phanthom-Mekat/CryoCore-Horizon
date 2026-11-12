"""Operator commands. Run from backend/:

    python -m app.cli sync --start 2026-01-01 [--end YYYY-MM-DD] [--product GCOV]
    python -m app.cli prepare-case karnaphuli-estuary [--from-extracts]
    python -m app.cli extract-case karnaphuli-estuary
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
    p.add_argument("--from-extracts", action="store_true",
                   help="Process the committed subsets in data/extracts/<case>/ (no download, no credentials)")
    e = commands.add_parser("extract-case", help="Cut the case's downloaded files to the small subsets processing reads")
    e.add_argument("case_id")
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
        job = run_job(database, settings, job_id, from_extracts=args.from_extracts)
        print(f"job {job['id']}: {job['state']} ({job['stage']})" + (f": {job['error']}" if job["error"] else ""))
        return 0 if job["state"] == "succeeded" else 1
    elif args.command == "extract-case":
        return extract_case(database, settings, args.case_id)
    return 0


def extract_case(database: Database, settings: Settings, case_id: str) -> int:
    import json
    from shapely.geometry import shape
    from .cases import source_info
    from .download import h5_source
    from .extract import write_case
    with database.connect() as db:
        case = db.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if case is None:
            print(f"unknown case: {case_id}", file=sys.stderr)
            return 2
        scenes = {k: db.execute("SELECT payload FROM scenes WHERE concept_id = ?", (case[f"{k}_concept_id"],)).fetchone()
                  for k in ("before", "after")}
    if None in scenes.values():
        print("a case scene is missing from the catalog; run 'python -m app.cli sync' first", file=sys.stderr)
        return 1
    scenes = {k: json.loads(v["payload"]) for k, v in scenes.items()}
    files = {k: settings.resolved_data_dir / "raw" / h5_source(s)["name"] for k, s in scenes.items()}
    missing = [f.name for f in files.values() if not f.is_file()]
    if missing:
        print(f"download the full files first ('prepare-case {case_id}'): missing {', '.join(missing)}", file=sys.stderr)
        return 1
    manifest = write_case(case_id, shape(json.loads(case["definition"])["geometry"]), files,
                          [source_info(scenes["before"]), source_info(scenes["after"])])
    for key in ("before", "after"):
        m = manifest[key]
        print(f"{key}: {m['file']} {m['bytes'] / 1e6:.1f} MB, rows {m['window']['rows']}, cols {m['window']['cols']}, "
              f"{', '.join(m['window']['terms'])} + mask")
    return 0


if __name__ == "__main__":
    sys.exit(main())
