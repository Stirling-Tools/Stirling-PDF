from __future__ import annotations

import json
import uuid
from collections.abc import Mapping
from typing import Any

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor, TracerProvider
from opentelemetry.trace import Span
from posthog.client import Client as PostHogClient

from stirling.config import AppSettings

# Pydantic AI OTel span attributes (gen_ai semantic conventions)
_OTEL_OPERATION_NAME = "gen_ai.operation.name"
_OTEL_SYSTEM = "gen_ai.system"
_OTEL_REQUEST_MODEL = "gen_ai.request.model"
_OTEL_RESPONSE_MODEL = "gen_ai.response.model"
_OTEL_INPUT_TOKENS = "gen_ai.usage.input_tokens"
_OTEL_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"
_OTEL_INPUT_MESSAGES = "gen_ai.input.messages"
_OTEL_OUTPUT_MESSAGES = "gen_ai.output.messages"
_OTEL_REQUEST_TEMPERATURE = "gen_ai.request.temperature"
_OTEL_REQUEST_MAX_TOKENS = "gen_ai.request.max_tokens"
_OTEL_TOOL_DEFINITIONS = "gen_ai.tool.definitions"
_OTEL_SERVER_ADDRESS = "server.address"
_OTEL_SERVER_PORT = "server.port"


class PostHogSpanProcessor(SpanProcessor):
    """Translates Pydantic AI OpenTelemetry spans into PostHog $ai_generation events."""

    def __init__(self, client: PostHogClient, distinct_id: str) -> None:
        self._client = client
        self._distinct_id = distinct_id
        self._seen_traces: set[str] = set()

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        pass

    def on_end(self, span: ReadableSpan) -> None:
        attrs = dict(span.attributes or {})

        if attrs.get(_OTEL_OPERATION_NAME) != "chat":
            return

        properties: dict[str, object] = {
            "$ai_provider": attrs.get(_OTEL_SYSTEM, ""),
            "$ai_model": attrs.get(_OTEL_RESPONSE_MODEL) or attrs.get(_OTEL_REQUEST_MODEL, ""),
            "$ai_input_tokens": attrs.get(_OTEL_INPUT_TOKENS, 0),
            "$ai_output_tokens": attrs.get(_OTEL_OUTPUT_TOKENS, 0),
        }

        if span.context:
            properties["$ai_trace_id"] = format(span.context.trace_id, "032x")
            properties["$ai_span_id"] = format(span.context.span_id, "016x")

        if span.parent and span.parent.span_id:
            properties["$ai_parent_id"] = format(span.parent.span_id, "016x")

        if span.start_time and span.end_time:
            properties["$ai_latency"] = (span.end_time - span.start_time) / 1e9

        if _OTEL_INPUT_MESSAGES in attrs:
            try:
                properties["$ai_input"] = json.loads(str(attrs[_OTEL_INPUT_MESSAGES]))
            except (json.JSONDecodeError, TypeError):
                properties["$ai_input"] = attrs[_OTEL_INPUT_MESSAGES]
        if _OTEL_OUTPUT_MESSAGES in attrs:
            try:
                output = json.loads(str(attrs[_OTEL_OUTPUT_MESSAGES]))
                properties["$ai_output_choices"] = self._transform_output_choices(output)
            except (json.JSONDecodeError, TypeError):
                properties["$ai_output_choices"] = attrs[_OTEL_OUTPUT_MESSAGES]

        model_parameters: dict[str, object] = {}
        if _OTEL_REQUEST_TEMPERATURE in attrs:
            model_parameters["temperature"] = attrs[_OTEL_REQUEST_TEMPERATURE]
        if _OTEL_REQUEST_MAX_TOKENS in attrs:
            model_parameters["max_tokens"] = attrs[_OTEL_REQUEST_MAX_TOKENS]
        if model_parameters:
            properties["$ai_model_parameters"] = model_parameters

        if _OTEL_TOOL_DEFINITIONS in attrs:
            try:
                properties["$ai_tools"] = json.loads(str(attrs[_OTEL_TOOL_DEFINITIONS]))
            except (json.JSONDecodeError, TypeError):
                pass

        base_url_parts = []
        if host := attrs.get(_OTEL_SERVER_ADDRESS):
            base_url_parts.append(str(host))
        if port := attrs.get(_OTEL_SERVER_PORT):
            base_url_parts.append(str(port))
        if base_url_parts:
            properties["$ai_base_url"] = ":".join(base_url_parts)

        trace_id = str(properties.get("$ai_trace_id", ""))
        if trace_id and trace_id not in self._seen_traces:
            self._seen_traces.add(trace_id)
            trace_properties: dict[str, object] = {
                "$ai_trace_id": trace_id,
                "$ai_trace_name": self._extract_user_message(attrs),
                "$ai_provider": attrs.get(_OTEL_SYSTEM, ""),
            }
            if span.start_time and span.end_time:
                trace_properties["$ai_latency"] = (span.end_time - span.start_time) / 1e9
            self._client.capture(
                distinct_id=self._distinct_id,
                event="$ai_trace",
                properties=trace_properties,
            )

        self._client.capture(
            distinct_id=self._distinct_id,
            event="$ai_generation",
            properties=properties,
        )

    @staticmethod
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

    @staticmethod
    def _extract_user_message(attrs: Mapping[str, Any]) -> str:
        """Extract the last user message from the input messages span attribute."""
        raw = attrs.get(_OTEL_INPUT_MESSAGES)
        if not raw:
            return ""
        try:
            messages = json.loads(str(raw))
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    for part in msg.get("parts", []):
                        if part.get("type") == "text":
                            return str(part.get("content", ""))
        except (json.JSONDecodeError, TypeError, KeyError):
            pass
        return ""

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
    distinct_id = str(uuid.uuid4())
    processor = PostHogSpanProcessor(client, distinct_id)

    provider = TracerProvider()
    provider.add_span_processor(processor)
    return provider
