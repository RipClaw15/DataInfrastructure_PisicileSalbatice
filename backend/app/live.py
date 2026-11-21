"""Bounded, ephemeral current telemetry; never a history of sensor samples.

The default deployment runs one API worker. Multiple workers/replicas need a
shared ephemeral cache to expose consistent live telemetry across instances.
Guard sessions, alerts, and retained snapshots always remain in PostgreSQL.
"""

from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from time import monotonic

from .schemas import EventResponse, Location


@dataclass(frozen=True)
class LiveSample:
    reading: EventResponse
    received_at: datetime
    location: Location | None
    location_at: datetime | None
    touched: float


class LiveTelemetry:
    def __init__(self, capacity: int = 2048, ttl_seconds: float = 600):
        self.capacity = capacity
        self.ttl_seconds = ttl_seconds
        self._items: OrderedDict[str, LiveSample] = OrderedDict()
        self._lock = RLock()

    def _prune(self, now: float) -> None:
        while self._items:
            oldest = next(iter(self._items.values()))
            if now - oldest.touched <= self.ttl_seconds:
                break
            self._items.popitem(last=False)
        while len(self._items) > self.capacity:
            self._items.popitem(last=False)

    def get(self, device_id: str) -> LiveSample | None:
        with self._lock:
            self._prune(monotonic())
            return self._items.get(device_id)

    def put(self, reading: EventResponse) -> None:
        with self._lock:
            now = monotonic()
            self._prune(now)
            previous = self._items.get(reading.device_id)
            newest = reading if previous is None or reading.timestamp >= previous.reading.timestamp else previous.reading
            location = previous.location if previous else None
            location_at = previous.location_at if previous else None
            if reading.location is not None and (location_at is None or reading.timestamp >= location_at):
                location, location_at = reading.location, reading.timestamp
            received_at = reading.received_at.replace(tzinfo=reading.received_at.tzinfo or timezone.utc).astimezone(timezone.utc)
            if previous is not None:
                received_at = max(received_at, previous.received_at)
            self._items[reading.device_id] = LiveSample(
                reading=newest, received_at=received_at,
                location=location, location_at=location_at, touched=now,
            )
            self._items.move_to_end(reading.device_id)
            self._prune(now)

    def forget(self, device_id: str) -> None:
        with self._lock:
            self._items.pop(device_id, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


live_telemetry = LiveTelemetry()
