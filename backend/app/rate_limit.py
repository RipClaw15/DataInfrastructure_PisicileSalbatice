"""Lightweight in-memory sliding-window rate limiter for pairing attempts."""

import threading
import time
from collections import deque

from fastapi import HTTPException

from .config import settings


class PairRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, deque[float]] = {}

    def _prune(self, bucket: deque[float], now: float) -> None:
        cutoff = now - settings.pair_rate_limit_window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._failures.get(key)
            if not bucket:
                return
            self._prune(bucket, now)
            if len(bucket) >= settings.pair_rate_limit_max_failures:
                raise HTTPException(
                    status_code=429,
                    detail="Too many attempts. Try again in a minute.",
                )

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._failures.setdefault(key, deque())
            self._prune(bucket, now)
            bucket.append(now)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()


pair_rate_limiter = PairRateLimiter()
