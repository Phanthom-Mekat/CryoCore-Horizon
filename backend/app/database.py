import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .schemas import Scene, SearchRequest
from .region import REGION

# Explicit, ordered migrations. Never edit a shipped one; append a new version instead.
MIGRATIONS = {
    1: """
        CREATE TABLE IF NOT EXISTS scenes (
            concept_id TEXT PRIMARY KEY,
            region_id TEXT NOT NULL,
            product TEXT NOT NULL,
            start_time TEXT,
            revision_id INTEGER NOT NULL,
            payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS scenes_product_time ON scenes(product, start_time);
        CREATE TABLE IF NOT EXISTS searches (
            id INTEGER PRIMARY KEY,
            region_id TEXT NOT NULL,
            request TEXT NOT NULL,
            bbox TEXT NOT NULL,
            total_hits INTEGER NOT NULL,
            returned_ids TEXT NOT NULL,
            retrieved_at TEXT NOT NULL
        );
    """,
    2: """
        CREATE TABLE regions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('division', 'analysis_area')),
            geometry TEXT NOT NULL,          -- GeoJSON, EPSG:4326
            provenance TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE cases (
            id TEXT PRIMARY KEY,
            region_id TEXT NOT NULL REFERENCES regions(id),
            title TEXT NOT NULL,
            place TEXT NOT NULL,
            stack TEXT NOT NULL,
            -- Soft links to scenes.concept_id: cases are defined before the catalog is synced.
            before_concept_id TEXT NOT NULL,
            after_concept_id TEXT NOT NULL,
            definition TEXT NOT NULL,        -- the curated case definition as JSON
            updated_at TEXT NOT NULL
        );
        CREATE TABLE processing_jobs (
            id INTEGER PRIMARY KEY,
            case_id TEXT NOT NULL REFERENCES cases(id),
            state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
            stage TEXT,
            progress REAL NOT NULL DEFAULT 0,
            error TEXT,
            error_code TEXT,
            retryable INTEGER NOT NULL DEFAULT 0,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            started_at TEXT,
            heartbeat_at TEXT,
            finished_at TEXT
        );
        -- At most one active job per case: duplicate requests reuse it.
        CREATE UNIQUE INDEX processing_jobs_one_active ON processing_jobs(case_id)
            WHERE state IN ('queued', 'running');
        CREATE INDEX processing_jobs_state ON processing_jobs(state, id);
        CREATE TABLE assets (
            id INTEGER PRIMARY KEY,
            case_id TEXT REFERENCES cases(id),
            kind TEXT NOT NULL,              -- 'source_h5' | 'layer' | 'findings' | 'timeseries' | 'manifest'
            name TEXT NOT NULL,              -- file name only; directories come from settings
            concept_id TEXT,
            revision_id INTEGER,
            size_bytes INTEGER,
            md5 TEXT,
            created_at TEXT NOT NULL,
            UNIQUE (case_id, kind, name)
        );
        CREATE TABLE analysis_runs (
            id INTEGER PRIMARY KEY,
            case_id TEXT NOT NULL REFERENCES cases(id),
            job_id INTEGER REFERENCES processing_jobs(id),
            method_name TEXT,
            method_version TEXT,
            params TEXT NOT NULL,
            metrics TEXT,
            sources TEXT NOT NULL,
            published_at TEXT NOT NULL
        );
        CREATE TABLE findings (
            id TEXT NOT NULL,
            case_id TEXT NOT NULL REFERENCES cases(id),
            run_id INTEGER NOT NULL REFERENCES analysis_runs(id),
            kind TEXT NOT NULL,
            quality TEXT,
            properties TEXT NOT NULL,
            geometry TEXT NOT NULL,
            PRIMARY KEY (case_id, id)
        );
        CREATE TABLE validation_records (
            id INTEGER PRIMARY KEY,
            case_id TEXT NOT NULL REFERENCES cases(id),
            finding_id TEXT,
            reference_source TEXT NOT NULL,
            observed_at TEXT,
            label TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        );
    """,
}
LATEST_VERSION = max(MIGRATIONS)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def schema_version(self) -> int:
        with self.connect() as db:
            return _current_version(db)

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        try:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
            current = _current_version(db)
            if current > LATEST_VERSION:
                raise RuntimeError(f"Database schema v{current} is newer than this code (v{LATEST_VERSION}).")
            if current and not db.execute("SELECT 1 FROM schema_version").fetchone():
                # A v1 database from before the schema_version table: record what is already there.
                db.execute("INSERT INTO schema_version VALUES (?, ?)", (current, now_iso()))
            for version in range(current + 1, LATEST_VERSION + 1):
                try:
                    # executescript runs outside Python's implicit transactions, so the script carries its own.
                    db.executescript(f"BEGIN IMMEDIATE;{MIGRATIONS[version]}"
                                     f"INSERT INTO schema_version VALUES ({version}, '{now_iso()}');"
                                     f"PRAGMA user_version={version};COMMIT;")
                except Exception:
                    if db.in_transaction:
                        db.execute("ROLLBACK")
                    raise
        finally:
            db.close()
        from .cases import seed_definitions  # cases imports schemas only; late import keeps modules independent
        with self.connect() as db:
            seed_definitions(db)

    def save_search(self, request: SearchRequest, scenes: list[Scene], hits: int, now: str) -> int:
        # Store the whole page atomically; repeated discovery does not duplicate scenes.
        with self.connect() as db:
            for scene in scenes:
                db.execute("""
                    INSERT INTO scenes VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(concept_id) DO UPDATE SET
                        product=excluded.product, start_time=excluded.start_time,
                        revision_id=excluded.revision_id, payload=excluded.payload
                    WHERE excluded.revision_id >= scenes.revision_id
                """, (scene.concept_id, REGION["id"], scene.product, scene.start_time,
                      scene.revision_id, scene.model_dump_json()))
            cursor = db.execute("""
                INSERT INTO searches(region_id, request, bbox, total_hits, returned_ids, retrieved_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (REGION["id"], request.model_dump_json(), json.dumps(REGION["bbox"]), hits,
                  json.dumps([s.concept_id for s in scenes]), now))
            return cursor.lastrowid

    def list_scenes(self, product: str | None, limit: int, offset: int):
        clause = "WHERE region_id = ?"
        args = [REGION["id"]]
        if product:
            clause += " AND product = ?"
            args.append(product)
        with self.connect() as db:
            total = db.execute(f"SELECT COUNT(*) FROM scenes {clause}", args).fetchone()[0]
            rows = db.execute(
                f"SELECT payload FROM scenes {clause} ORDER BY start_time DESC, concept_id LIMIT ? OFFSET ?",
                [*args, limit, offset],
            ).fetchall()
        return {"total": total, "limit": limit, "offset": offset,
                "scenes": [json.loads(r["payload"]) for r in rows]}

    def get_scene(self, concept_id: str):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM scenes WHERE concept_id = ?", (concept_id,)).fetchone()
        return json.loads(row["payload"]) if row else None


def _current_version(db) -> int:
    has_table = db.execute("SELECT 1 FROM sqlite_master WHERE name = 'schema_version'").fetchone()
    recorded = db.execute("SELECT MAX(version) FROM schema_version").fetchone()[0] if has_table else None
    return recorded or db.execute("PRAGMA user_version").fetchone()[0]
