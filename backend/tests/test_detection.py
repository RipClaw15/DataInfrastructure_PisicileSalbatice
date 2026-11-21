import math

import pytest

from backend.app.detection import angle_deg, picked_up_angle


@pytest.mark.parametrize("angle,expected", [(0, False), (5.9, False), (5.99, False), (6.01, True), (6.1, True), (90, True), (180, True)])
def test_threshold(angle, expected):
    reading = (math.sin(math.radians(angle)), 0, -math.cos(math.radians(angle)))
    assert (picked_up_angle((0, 0, -1), reading) is not None) is expected


def test_magnitude_does_not_change_orientation():
    assert picked_up_angle((0, 0, -1), (0, 0, -100)) is None


def test_zero_vector_has_no_orientation():
    assert angle_deg((0, 0, 0), (0, 0, -1)) == 0
    assert picked_up_angle((0, 0, -1), (0, 0, 0)) is None


def test_extreme_finite_values_do_not_overflow():
    assert angle_deg((1e308, 1e308, 1e308), (-1e308, -1e308, -1e308)) == pytest.approx(180)
    assert picked_up_angle((1e-300, 0, 0), (1e-300, 0, 0)) is None
