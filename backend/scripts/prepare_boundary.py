"""Download a pinned, attributed boundary; run from backend with the venv Python."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from shapely.geometry import shape

URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbHumanitarian/BGD/ADM1/geoBoundaries-BGD-ADM1.geojson"
OUT = Path(__file__).resolve().parents[1] / "app" / "assets"


def main():
    response = httpx.get(URL, follow_redirects=True, timeout=90)
    response.raise_for_status()
    matches = [f for f in response.json()["features"] if f["properties"]["shapeName"] == "Chittagong"]
    if len(matches) != 1 or not shape(matches[0]["geometry"]).is_valid:
        raise RuntimeError("Expected one valid Chittagong polygon")
    feature = matches[0]
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.dumps(feature, separators=(",", ":")).encode()
    (OUT / "chattogram.geojson").write_bytes(data)
    metadata = {
        "name": "Chattogram Division", "source_name": "Chittagong",
        "source": "Bangladesh Bureau of Statistics (BBS) / HDX, via geoBoundaries gbHumanitarian",
        "source_url": "https://data.humdata.org/dataset/cod-ab-bgd",
        "download_url": URL, "boundary_id": "BGD-ADM1-88445334",
        "year": 2018, "license": "CC BY 3.0 IGO",
        "license_url": "https://creativecommons.org/licenses/by/3.0/igo/",
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "sha256": hashlib.sha256(data).hexdigest(),
        "note": "2018 reference boundary, not verified as the current legal boundary. Display is simplified; intersection tests use the original geometry. Not suitable for cadastral decisions.",
    }
    (OUT / "boundary-source.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Saved {len(data):,} bytes; bounds: {shape(feature['geometry']).bounds}")


if __name__ == "__main__":
    main()
