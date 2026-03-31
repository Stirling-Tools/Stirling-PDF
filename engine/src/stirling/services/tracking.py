from __future__ import annotations

import time
import uuid
from types import TracebackType
from typing import Protocol

from posthog.client import Client

from stirling.config import AppSettings


class TimedEvent:
    """Context manager that measures duration and captures a tracking event on exit."""

    def __init__(self, service: TrackingService, event: str, properties: dict[str, object]) -> None:
        self._service = service
        self._event = event
        self._properties = properties
        self._start = 0.0

    def __enter__(self) -> TimedEvent:
        self._start = time.monotonic()
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc_val: BaseException | None, exc_tb: TracebackType | None
    ) -> None:
        if exc_type is None:
            self._properties["duration_ms"] = (time.monotonic() - self._start) * 1000
            self._service.capture_event(self._event, self._properties)


class TrackingService(Protocol):
    """Interface for event tracking."""

    def capture_event(self, event: str, properties: dict[str, object] | None = None) -> None: ...

    def timed_event(self, event: str, properties: dict[str, object] | None = None) -> TimedEvent: ...

    def close(self) -> None: ...


class PostHogTracking(Client):
    """PostHog implementation of TrackingService."""

    def __init__(self, api_key: str, host: str, base_properties: dict[str, object]) -> None:
        super().__init__(project_api_key=api_key, host=host)
        self._distinct_id = str(uuid.uuid4())
        self._base_properties = base_properties

    def capture_event(self, event: str, properties: dict[str, object] | None = None) -> None:
        merged = {**self._base_properties, **(properties or {})}
        self.capture(distinct_id=self._distinct_id, event=event, properties=merged)

    def timed_event(self, event: str, properties: dict[str, object] | None = None) -> TimedEvent:
        merged = {**self._base_properties, **(properties or {})}
        return TimedEvent(self, event, merged)

    def close(self) -> None:
        self.shutdown()


class NoOpTracking:
    """No-op implementation when tracking is disabled."""

    def capture_event(self, event: str, properties: dict[str, object] | None = None) -> None:
        pass

    def timed_event(self, event: str, properties: dict[str, object] | None = None) -> TimedEvent:
        return TimedEvent(self, event, properties or {})

    def close(self) -> None:
        pass


def build_tracking(settings: AppSettings) -> TrackingService:
    """Build the appropriate tracking service based on settings."""
    if settings.posthog_enabled and settings.posthog_api_key:
        return PostHogTracking(
            api_key=settings.posthog_api_key,
            host=settings.posthog_host,
            base_properties=settings.tracking_properties(),
        )
    return NoOpTracking()
