import numpy as np
import pytest

from app.inspection import InspectionError
from app.subset import calculate, decibels, valid_power


def sample(power, mask=None, exceptions=None):
    power = np.array(power, dtype="float32")
    return {"HHHH": power, "HVHV": power.copy(),
            "mask": np.ones(power.shape, dtype="uint8") if mask is None else np.array(mask),
            "inputDataExceptionMask": np.zeros(power.shape, dtype="uint8") if exceptions is None else np.array(exceptions),
            "subswaths": 4}


def test_power_to_db_preserves_invalid_pixels():
    data = sample([[1, 10, 0, -1, np.nan, np.inf]])
    valid = valid_power(data["HHHH"], data["mask"], data["inputDataExceptionMask"], 4)
    result = decibels(data["HHHH"], valid)
    np.testing.assert_allclose(result[0, :2], [0, 10])
    assert np.isnan(result[0, 2:]).all()


def test_common_coverage_sign_area_and_repeatability():
    before = sample([[1, 10, 1, 1, 1]], mask=[[1, 2, 0, 255, 1]])
    after = sample([[10, 1, 1, 1, 1]], exceptions=[[0, 0, 0, 0, 2]])
    roi = np.ones((1, 5), dtype=bool)
    layers, stats = calculate(before, after, roi, 400)
    np.testing.assert_allclose(layers["change-HHHH"][0,:2], [10, -10])
    assert np.isnan(layers["change-HHHH"][0,2:]).all()
    assert stats["HHHH"]["common_valid_pixels"] == 2
    assert stats["HHHH"]["common_area_km2"] == 0.0008
    assert stats["HHHH"]["excluded_pixels"] == 3
    assert calculate(before, after, roi, 400)[1] == stats


def test_zero_coverage_and_mismatched_masks_fail():
    before = sample([[1]], mask=[[0]])
    with pytest.raises(InspectionError, match="No valid common"):
        calculate(before, sample([[1]]), np.ones((1,1), dtype=bool), 400)
    with pytest.raises(InspectionError, match="dimensions"):
        valid_power(np.ones((2,2)), np.ones((1,1)), np.ones((2,2)), 4)


def test_outside_roi_never_contributes():
    layers, stats = calculate(sample([[1, 100]]), sample([[1, 1]]), np.array([[True, False]]), 400)
    assert stats["HHHH"]["roi_pixels"] == 1
    assert stats["HHHH"]["median_change_db"] == 0
    assert np.isnan(layers["before-HHHH"][0,1])
