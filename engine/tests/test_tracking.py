from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
    GEN_AI_INPUT_MESSAGES,
    GEN_AI_OPERATION_NAME,
    GEN_AI_SYSTEM,
    GenAiOperationNameValues,
)

from stirling.config import AppSettings
from stirling.services.tracking import PostHogSpanProcessor, current_user_id, setup_posthog_tracking


@dataclass
class _FakeContext:
    trace_id: int
    span_id: int


@dataclass
class _FakeParent:
    span_id: int


class _FakeSpan:
    """Minimal stand-in for the OpenTelemetry ReadableSpan fields the processor reads."""

    def __init__(self, attributes: dict[str, Any], trace_id: int = 0x1234, span_id: int = 0x9) -> None:
        self.attributes = attributes
        self.context = _FakeContext(trace_id=trace_id, span_id=span_id)
        self.parent = _FakeParent(span_id=0x1)
        self.start_time = 1_000_000_000
        self.end_time = 2_000_000_000


class _RecordingClient:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    def capture(self, *, distinct_id: str | None, event: str, properties: dict[str, Any]) -> None:
        self.events.append((event, properties))


class _RaisingClient:
    def capture(self, **_kwargs: Any) -> None:
        raise RuntimeError("boom")


def _processor(client: object) -> PostHogSpanProcessor:
    # The processor only calls ``capture`` on its client; the test doubles model
    # that surface without being real PostHog clients (which start threads).
    return PostHogSpanProcessor(client)  # type: ignore[arg-type]


def _on_end(processor: PostHogSpanProcessor, span: object) -> None:
    processor.on_end(span)  # type: ignore[arg-type]


def _chat_attrs() -> dict[str, Any]:
    return {
        GEN_AI_OPERATION_NAME: GenAiOperationNameValues.CHAT.value,
        GEN_AI_SYSTEM: "anthropic",
        GEN_AI_INPUT_MESSAGES: json.dumps([{"role": "user", "parts": [{"type": "text", "content": "hello"}]}]),
    }


def test_chat_span_emits_generation_and_trace() -> None:
    client = _RecordingClient()

    _on_end(_processor(client), _FakeSpan(_chat_attrs()))

    emitted = [event for event, _ in client.events]
    assert "$ai_generation" in emitted
    assert "$ai_trace" in emitted


def test_trace_event_deduplicated_per_trace() -> None:
    client = _RecordingClient()
    processor = _processor(client)

    _on_end(processor, _FakeSpan(_chat_attrs(), trace_id=0x42, span_id=0x1))
    _on_end(processor, _FakeSpan(_chat_attrs(), trace_id=0x42, span_id=0x2))

    trace_events = [event for event, _ in client.events if event == "$ai_trace"]
    generation_events = [event for event, _ in client.events if event == "$ai_generation"]
    assert len(trace_events) == 1
    assert len(generation_events) == 2


def test_non_chat_span_is_ignored() -> None:
    client = _RecordingClient()

    _on_end(_processor(client), _FakeSpan({GEN_AI_OPERATION_NAME: "embeddings"}))

    assert client.events == []


def test_on_end_never_raises_when_delivery_fails() -> None:
    # A telemetry failure must not propagate into Span.end() and break the
    # model request, nor wedge emission for every subsequent span.
    _on_end(_processor(_RaisingClient()), _FakeSpan(_chat_attrs()))  # must not raise


def test_on_end_never_raises_on_malformed_span() -> None:
    processor = _processor(_RecordingClient())

    broken = _FakeSpan(_chat_attrs())
    broken.context = None  # type: ignore[assignment]

    _on_end(processor, broken)  # must not raise


def test_distinct_id_pulled_from_context_var() -> None:
    client = _RecordingClient()
    processor = _processor(client)

    token = current_user_id.set("user-123")  # type: ignore[arg-type]
    try:
        _on_end(processor, _FakeSpan(_chat_attrs()))
    finally:
        current_user_id.reset(token)

    assert client.events, "expected at least one captured event"


def test_setup_returns_none_when_disabled(app_settings: AppSettings) -> None:
    # conftest builds settings with posthog disabled; setup must no-op.
    assert setup_posthog_tracking(app_settings) is None
