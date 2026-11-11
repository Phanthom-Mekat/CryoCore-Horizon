import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .schemas import Scene, SearchRequest
from .region import REGION


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

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError(f"Unsupported database schema version: {version}")
            db.executescript("""
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
                PRAGMA user_version=1;
            """)

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
