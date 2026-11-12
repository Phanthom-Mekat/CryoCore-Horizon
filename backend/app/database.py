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
            db.execute("BEGIN IMMEDIATE")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 3:
                raise RuntimeError(f"Unsupported database schema version: {version}")
            # Each migration and its version update commit together; preserve v1/v2 data.
            if version < 1:
                db.execute("CREATE TABLE scenes (concept_id TEXT PRIMARY KEY, region_id TEXT NOT NULL, product TEXT NOT NULL, start_time TEXT, revision_id INTEGER NOT NULL, payload TEXT NOT NULL)")
                db.execute("CREATE INDEX scenes_product_time ON scenes(product, start_time)")
                db.execute("CREATE TABLE searches (id INTEGER PRIMARY KEY, region_id TEXT NOT NULL, request TEXT NOT NULL, bbox TEXT NOT NULL, total_hits INTEGER NOT NULL, returned_ids TEXT NOT NULL, retrieved_at TEXT NOT NULL)")
            if version < 2:
                db.execute("CREATE TABLE inspections (concept_id TEXT NOT NULL, revision_id INTEGER NOT NULL, inspected_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (concept_id, revision_id))")
            if version < 3:
                db.execute("CREATE TABLE downloads (asset_id TEXT PRIMARY KEY, concept_id TEXT NOT NULL, revision_id INTEGER NOT NULL, payload TEXT NOT NULL)")
                db.execute("CREATE INDEX downloads_scene ON downloads(concept_id, revision_id)")
            db.execute("PRAGMA user_version=3")

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

    def save_inspection(self, report):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO inspections VALUES (?, ?, ?, ?)",
                       (report["concept_id"], report["revision_id"], report["inspected_at"],
                        json.dumps(report, allow_nan=False)))

    def get_inspection(self, concept_id, revision_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM inspections WHERE concept_id=? AND revision_id=?",
                             (concept_id, revision_id)).fetchone()
        return json.loads(row["payload"]) if row else None

    def save_download(self, report):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO downloads VALUES (?, ?, ?, ?)",
                       (report["asset_id"], report["concept_id"], report["revision_id"], json.dumps(report, allow_nan=False)))

    def get_download(self, asset_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM downloads WHERE asset_id=?", (asset_id,)).fetchone()
        return json.loads(row["payload"]) if row else None

    def scene_downloads(self, concept_id, revision_id):
        with self.connect() as db:
            rows = db.execute("SELECT payload FROM downloads WHERE concept_id=? AND revision_id=?", (concept_id, revision_id)).fetchall()
        return [json.loads(row["payload"]) for row in rows]
