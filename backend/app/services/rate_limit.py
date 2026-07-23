from __future__ import annotations

import asyncio
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitExceeded(Exception):
    retry_after: int


class InMemoryRateLimiter:
    """Small per-process sliding-window limiter for expensive endpoints.

    It deliberately provides only a local safety net. Multi-replica production
    deployments should enforce their global quota at the gateway or shared store.
    """

    def __init__(self, *, max_keys: int = 10_000) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._last_seen: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._max_keys = max_keys

    async def check(self, key: str, *, limit: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds

        async with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()

            if len(events) >= limit:
                retry_after = max(1, math.ceil(window_seconds - (now - events[0])))
                raise RateLimitExceeded(retry_after=retry_after)

            events.append(now)
            self._last_seen[key] = now
            if len(self._events) > self._max_keys:
                self._remove_stale_keys(cutoff)

    def _remove_stale_keys(self, cutoff: float) -> None:
        stale = [key for key, seen_at in self._last_seen.items() if seen_at <= cutoff]
        for key in stale:
            self._events.pop(key, None)
            self._last_seen.pop(key, None)

        if len(self._events) <= self._max_keys:
            return

        overflow = len(self._events) - self._max_keys
        oldest = sorted(self._last_seen, key=self._last_seen.get)[:overflow]
        for key in oldest:
            self._events.pop(key, None)
            self._last_seen.pop(key, None)

    async def reset(self) -> None:
        async with self._lock:
            self._events.clear()
            self._last_seen.clear()


rate_limiter = InMemoryRateLimiter()
