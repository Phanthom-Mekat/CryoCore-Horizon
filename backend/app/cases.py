"""Read only published case bundles; staging output is never discoverable."""
import json
import re
from pathlib import Path


def read_case(root: Path, case_id: str):
    if not re.fullmatch(r"[a-f0-9]{24}", case_id): return None
    path = root / case_id / "manifest.json"
    if not path.is_file(): return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_cases(root: Path):
    if not root.exists(): return []
    return [case for child in sorted(root.iterdir()) if (case := read_case(root, child.name)) is not None]
