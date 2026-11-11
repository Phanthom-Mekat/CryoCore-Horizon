from datetime import datetime, timezone

import httpx

from .region import REGION
from .schemas import Scene, SearchRequest

CMR_URL = "https://cmr.earthdata.nasa.gov/search/"


class CatalogError(Exception):
    pass


class NasaCatalog:
    def __init__(self, client: httpx.Client):
        self.client = client

    def search(self, query: SearchRequest) -> tuple[list[Scene], int, str]:
        now = datetime.now(timezone.utc).isoformat()
        try:
            # Resolve collection IDs from NASA rather than hard-coding IDs or versions.
            collections_response = self.client.get("collections.json", params={
                "short_name": f"NISAR_L2_{query.product}_*",
                "options[short_name][pattern]": "true", "page_size": 100,
            })
            collections_response.raise_for_status()
            collections = collections_response.json()["feed"]["entry"]
            if not collections:
                raise CatalogError(f"NASA CMR returned no NISAR {query.product} collection.")
            if len(collections) >= 100:
                raise CatalogError("Collection discovery exceeded its limit; refine the catalog query.")
            params = {
                "collection_concept_id[]": [c["id"] for c in collections],
                "bounding_box": ",".join(map(str, REGION["bbox"])),
                "temporal": f"{query.start_date}T00:00:00Z,{query.end_date}T23:59:59.999Z",
                "page_size": query.page_size, "page_num": query.page,
                "sort_key": "-start_date",
            }
            response = self.client.get("granules.umm_json", params=params)
            response.raise_for_status()
            payload = response.json()
            scenes = []
            for item in payload["items"]:
                umm, meta = item["umm"], item["meta"]
                temporal = umm.get("TemporalExtent", {})
                dates = temporal.get("RangeDateTime", {})
                scenes.append(Scene(
                    concept_id=meta["concept-id"], revision_id=meta["revision-id"],
                    granule_id=umm["GranuleUR"],
                    collection=umm["CollectionReference"]["ShortName"], product=query.product,
                    start_time=dates.get("BeginningDateTime") or temporal.get("SingleDateTime"),
                    end_time=dates.get("EndingDateTime") or temporal.get("SingleDateTime"),
                    urls=umm.get("RelatedUrls", []), spatial_extent=umm.get("SpatialExtent", {}),
                    metadata=item, retrieved_at=now,
                ))
            return scenes, int(payload["hits"]), now
        except httpx.TimeoutException as exc:
            raise CatalogError("NASA CMR timed out. Retry the search later.") from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise CatalogError("NASA CMR returned an unavailable or unexpected response.") from exc
