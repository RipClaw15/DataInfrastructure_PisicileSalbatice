"""Pure v1 movement rule. Zero-length readings have no measurable orientation."""

import math
from collections.abc import Sequence

PICKED_UP_DEG = 6.0


def angle_deg(rest: Sequence[float], reading: Sequence[float]) -> float:
    
    rest_scale = max(abs(v) for v in rest)
    reading_scale = max(abs(v) for v in reading)
    if rest_scale == 0 or reading_scale == 0:
        return 0.0
    a = [v / rest_scale for v in rest]
    b = [v / reading_scale for v in reading]
    cosine = sum(x * y for x, y in zip(a, b)) / (math.hypot(*a) * math.hypot(*b))
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine))))


def picked_up_angle(rest: Sequence[float], reading: Sequence[float]) -> float | None:
    """Return the rounded alert angle only when strictly above the threshold."""
    angle = angle_deg(rest, reading)
    return round(angle, 1) if angle > PICKED_UP_DEG else None
