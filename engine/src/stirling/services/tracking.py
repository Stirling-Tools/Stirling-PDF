from __future__ import annotations

import uuid

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
_OTEL_SERVER_ADDRESS = "server.address"
_OTEL_SERVER_PORT = "server.port"


class PostHogSpanProcessor(SpanProcessor):
    """Translates Pydantic AI OpenTelemetry spans into PostHog $ai_generation events."""

    def __init__(self, client: PostHogClient, distinct_id: str) -> None:
        self._client = client
        self._distinct_id = distinct_id

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
            properties["$ai_input"] = attrs[_OTEL_INPUT_MESSAGES]
        if _OTEL_OUTPUT_MESSAGES in attrs:
            properties["$ai_output_choices"] = attrs[_OTEL_OUTPUT_MESSAGES]

        model_parameters: dict[str, object] = {}
        if _OTEL_REQUEST_TEMPERATURE in attrs:
            model_parameters["temperature"] = attrs[_OTEL_REQUEST_TEMPERATURE]
        if _OTEL_REQUEST_MAX_TOKENS in attrs:
            model_parameters["max_tokens"] = attrs[_OTEL_REQUEST_MAX_TOKENS]
        if model_parameters:
            properties["$ai_model_parameters"] = model_parameters

        base_url_parts = []
        if host := attrs.get(_OTEL_SERVER_ADDRESS):
            base_url_parts.append(str(host))
        if port := attrs.get(_OTEL_SERVER_PORT):
            base_url_parts.append(str(port))
        if base_url_parts:
            properties["$ai_base_url"] = ":".join(base_url_parts)

        self._client.capture(
            distinct_id=self._distinct_id,
            event="$ai_generation",
            properties=properties,
        )

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
