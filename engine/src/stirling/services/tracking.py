from __future__ import annotations

import json
from collections import OrderedDict
from collections.abc import Mapping
from contextvars import ContextVar
from typing import Any

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor, TracerProvider
from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (  # No public import for these constants yet
    GEN_AI_INPUT_MESSAGES,
    GEN_AI_OPERATION_NAME,
    GEN_AI_OUTPUT_MESSAGES,
    GEN_AI_REQUEST_MAX_TOKENS,
    GEN_AI_REQUEST_MODEL,
    GEN_AI_REQUEST_TEMPERATURE,
    GEN_AI_RESPONSE_MODEL,
    GEN_AI_SYSTEM,
    GEN_AI_TOOL_DEFINITIONS,
    GEN_AI_USAGE_INPUT_TOKENS,
    GEN_AI_USAGE_OUTPUT_TOKENS,
    GenAiOperationNameValues,
)
from opentelemetry.semconv.attributes.server_attributes import SERVER_ADDRESS, SERVER_PORT
from opentelemetry.trace import Span
from posthog.client import Client as PostHogClient

from stirling.config import AppSettings

# Per-request user ID, set by middleware from the X-User-Id header.
# When not set, PostHog generates a random ID and marks the event as personless.
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)


class LRUSet:
    """Least Recently Used Set: a set with a maximum size that evicts the oldest entries first."""

    def __init__(self, max_size: int) -> None:
        self._max_size = max_size
        self._data: OrderedDict[str, None] = OrderedDict()

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def add(self, key: str) -> None:
        self._data[key] = None
        if len(self._data) > self._max_size:
            self._data.popitem(last=False)


def _parse_json_attr(attrs: Mapping[str, Any], key: str) -> Any | None:
    """Parse a JSON string span attribute, returning None on failure."""
    raw = attrs.get(key)
    if raw is None:
        return None
    try:
        return json.loads(str(raw))
    except (json.JSONDecodeError, TypeError):
        return None


def _transform_output_choices(choices: list[Any]) -> list[Any]:
    """Transform Pydantic AI's parts-based output format to PostHog-compatible format.

    Pydantic AI emits: ``[{"role": "assistant", "parts": [{"type": "tool_call", "name": "..."}]}]``
    PostHog expects: ``[{"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": "..."}}]}]``
    """
    for choice in choices:
        if not isinstance(choice, dict) or "parts" not in choice:
            continue
        tool_calls = []
        for part in choice.get("parts", []):
            if isinstance(part, dict) and part.get("type") == "tool_call":
                tool_calls.append(
                    {
                        "type": "function",
                        "id": part.get("id", ""),
                        "function": {"name": part.get("name", "")},
                    }
                )
        if tool_calls:
            choice["tool_calls"] = tool_calls
        choice["content"] = choice.pop("parts")
    return choices


def _extract_user_message(attrs: Mapping[str, Any]) -> str:
    """Extract the last user message text from the input messages span attribute."""
    messages = _parse_json_attr(attrs, GEN_AI_INPUT_MESSAGES)
    if not isinstance(messages, list):
        return ""
    for msg in reversed(messages):
        if not isinstance(msg, dict):
            continue
        if msg.get("role") == "user":
            for part in msg.get("parts", []):
                if isinstance(part, dict) and part.get("type") == "text":
                    return str(part.get("content", ""))
    return ""


# TODO: Replace with an official PostHog integration if one ever exists
class PostHogSpanProcessor(SpanProcessor):
    """Translates Pydantic AI OpenTelemetry spans into PostHog $ai_generation events."""

    def __init__(self, client: PostHogClient) -> None:
        self._client = client
        self._seen_traces = LRUSet(max_size=10_000)

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        pass

    def on_end(self, span: ReadableSpan) -> None:
        attrs = dict(span.attributes or {})
        if attrs.get(GEN_AI_OPERATION_NAME) != GenAiOperationNameValues.CHAT.value:
            return

        properties = self._build_generation_properties(span, attrs)
        self._maybe_emit_trace_event(span, attrs, properties)
        self._client.capture(
            distinct_id=current_user_id.get(),
            event="$ai_generation",
            properties=properties,
        )

    def _build_generation_properties(self, span: ReadableSpan, attrs: Mapping[str, Any]) -> dict[str, object]:
        """Build the $ai_generation event properties from span data."""
        properties: dict[str, object] = {
            "$ai_provider": attrs.get(GEN_AI_SYSTEM, ""),
            "$ai_model": attrs.get(GEN_AI_RESPONSE_MODEL) or attrs.get(GEN_AI_REQUEST_MODEL, ""),
            "$ai_input_tokens": attrs.get(GEN_AI_USAGE_INPUT_TOKENS, 0),
            "$ai_output_tokens": attrs.get(GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        }

        if span.context:
            properties["$ai_trace_id"] = format(span.context.trace_id, "032x")
            properties["$ai_span_id"] = format(span.context.span_id, "016x")
        if span.parent and span.parent.span_id:
            properties["$ai_parent_id"] = format(span.parent.span_id, "016x")
        if span.start_time and span.end_time:
            properties["$ai_latency"] = (span.end_time - span.start_time) / 1e9

        self._add_message_properties(properties, attrs)
        self._add_model_parameters(properties, attrs)
        self._add_tool_definitions(properties, attrs)
        self._add_base_url(properties, attrs)

        return properties

    def _maybe_emit_trace_event(
        self, span: ReadableSpan, attrs: Mapping[str, Any], properties: dict[str, object]
    ) -> None:
        """Emit an $ai_trace event for the first span seen per trace ID."""
        trace_id = str(properties.get("$ai_trace_id", ""))
        if not trace_id or trace_id in self._seen_traces:
            return

        self._seen_traces.add(trace_id)
        trace_properties: dict[str, object] = {
            "$ai_trace_id": trace_id,
            "$ai_trace_name": _extract_user_message(attrs),
            "$ai_provider": attrs.get(GEN_AI_SYSTEM, ""),
        }
        if span.start_time and span.end_time:
            trace_properties["$ai_latency"] = (span.end_time - span.start_time) / 1e9
        self._client.capture(
            distinct_id=current_user_id.get(),
            event="$ai_trace",
            properties=trace_properties,
        )

    @staticmethod
    def _add_message_properties(properties: dict[str, object], attrs: Mapping[str, Any]) -> None:
        input_messages = _parse_json_attr(attrs, GEN_AI_INPUT_MESSAGES)
        if input_messages is not None:
            properties["$ai_input"] = input_messages

        output_messages = _parse_json_attr(attrs, GEN_AI_OUTPUT_MESSAGES)
        if isinstance(output_messages, list):
            properties["$ai_output_choices"] = _transform_output_choices(output_messages)
        elif output_messages is not None:
            properties["$ai_output_choices"] = output_messages

    @staticmethod
    def _add_model_parameters(properties: dict[str, object], attrs: Mapping[str, Any]) -> None:
        model_parameters: dict[str, object] = {}
        if GEN_AI_REQUEST_TEMPERATURE in attrs:
            model_parameters["temperature"] = attrs[GEN_AI_REQUEST_TEMPERATURE]
        if GEN_AI_REQUEST_MAX_TOKENS in attrs:
            model_parameters["max_tokens"] = attrs[GEN_AI_REQUEST_MAX_TOKENS]
        if model_parameters:
            properties["$ai_model_parameters"] = model_parameters

    @staticmethod
    def _add_tool_definitions(properties: dict[str, object], attrs: Mapping[str, Any]) -> None:
        tools = _parse_json_attr(attrs, GEN_AI_TOOL_DEFINITIONS)
        if tools is not None:
            properties["$ai_tools"] = tools

    @staticmethod
    def _add_base_url(properties: dict[str, object], attrs: Mapping[str, Any]) -> None:
        parts: list[str] = []
        if host := attrs.get(SERVER_ADDRESS):
            parts.append(str(host))
        if port := attrs.get(SERVER_PORT):
            parts.append(str(port))
        if parts:
            properties["$ai_base_url"] = ":".join(parts)

    def shutdown(self) -> None:
        self._client.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        self._client.flush()
        return True


def setup_posthog_tracking(settings: AppSettings) -> TracerProvider | None:
    """Configure OpenTelemetry with a PostHog span processor for LLM analytics.

    Returns the TracerProvider so it can be shut down on app exit,
    or None when tracking is disabled.
    """
    if not settings.posthog_enabled or not settings.posthog_api_key:
        return None

    client = PostHogClient(project_api_key=settings.posthog_api_key, host=settings.posthog_host)
    processor = PostHogSpanProcessor(client)

    provider = TracerProvider()
    provider.add_span_processor(processor)
    return provider
