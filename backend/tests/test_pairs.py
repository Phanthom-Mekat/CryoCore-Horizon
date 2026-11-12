from copy import deepcopy

from app.pairs import assess_pair


def fixtures():
    scene = {"concept_id": "a", "start_time": "2026-07-07", "collection": "provisional", "spatial_extent": {
        "HorizontalSpatialDomain": {"Geometry": {"BoundingRectangles": [{"WestBoundingCoordinate": 91.5,
            "EastBoundingCoordinate": 92.0, "SouthBoundingCoordinate": 22.0, "NorthBoundingCoordinate": 23.0}]}}},
        "metadata": {"umm": {"AdditionalAttributes": [{"Name": k, "Values": v} for k, v in {
            "PRODUCTION_PIPELINE": ["PR"], "FREQUENCIES": ["A"], "FREQUENCY_A_RANGE_BANDWIDTH": ["20"]}.items()]}}}
    other = deepcopy(scene)
    other.update(concept_id="b", start_time="2026-10-11")
    report = {"identification": {k: "same" for k in ("trackNumber", "frameNumber", "orbitPassDirection",
        "lookDirection", "productType", "productVersion", "productSpecificationVersion", "radarBand")},
        "frequencies": {"frequencyA": {**{k: {"value": 20} for k in ("projection", "xCoordinateSpacing", "yCoordinateSpacing", "listOfPolarizations")},
            **{k: {"endpoints": [1, 2]} for k in ("xCoordinates", "yCoordinates")},
            **{k: {"shape": [10, 10]} for k in ("HHHH", "HVHV", "mask", "inputDataExceptionMask")}}}}
    return scene, other, report, deepcopy(report)


def test_metadata_gate_is_not_scientific_readiness():
    result = assess_pair(*fixtures())
    assert result["status"] == "metadata_compatible"
    assert not result["analysis_ready"]


def test_mask_shape_and_missing_layers_block_frequency():
    a, b, x, y = fixtures()
    y["frequencies"]["frequencyA"]["inputDataExceptionMask"]["shape"] = [40, 40]
    assert assess_pair(a, b, x, y)["status"] == "blocked"
    del y["frequencies"]["frequencyA"]["mask"]
    assert len(assess_pair(a, b, x, y)["frequencies"]["frequencyA"]["issues"]) == 2


def test_version_grid_and_same_scene_rejected():
    a, b, x, y = fixtures()
    y["identification"]["productVersion"] = "different"
    assert assess_pair(a, b, x, y)["status"] == "blocked"
    assert assess_pair(a, a, x, x)["status"] == "blocked"
    y = deepcopy(x)
    x["frequencies"]["frequencyA"]["xCoordinates"]["endpoints"] = [2, 3]
    assert assess_pair(a, b, x, x)["status"] == "metadata_compatible"
    assert assess_pair(a, b, x, y)["status"] == "blocked"
    assert assess_pair(a, b, None, y)["status"] == "needs_inspection"
