from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import Mock

import httpx
import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from posthog.client import Client
from pydantic_ai import Agent
from pydantic_ai.capabilities import Instrumentation
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.instrumented import InstrumentationSettings
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.test import TestModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from stirling.models import UserId
from stirling.services.tracking import PostHogSpanProcessor, current_user_id


@pytest.fixture
def tracking_capture() -> Iterator[tuple[TracerProvider, Mock, InMemorySpanExporter]]:
    client = Mock(spec=Client)
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(PostHogSpanProcessor(client))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    token = current_user_id.set(UserId("tracking-test-user"))
    try:
        yield provider, client, exporter
    finally:
        current_user_id.reset(token)
        provider.shutdown()


def _model_response(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/messages"):
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-test",
                "content": [{"type": "text", "text": "hello"}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 2},
            },
        )
    assert request.url.path.endswith("/chat/completions")
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl_test",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-test",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "hello"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
        },
    )


def _assert_tracking(capture: tuple[TracerProvider, Mock, InMemorySpanExporter], expected_generations: int) -> None:
    _, client, exporter = capture
    spans = exporter.get_finished_spans()
    chat_spans = [span for span in spans if (span.attributes or {}).get("gen_ai.operation.name") == "chat"]
    generations = [call.kwargs for call in client.capture.call_args_list if call.kwargs["event"] == "$ai_generation"]
    traces = [call.kwargs for call in client.capture.call_args_list if call.kwargs["event"] == "$ai_trace"]
    assert len(chat_spans) == len(generations) == expected_generations
    expected_span_ids = set()
    for span in chat_spans:
        assert span.context is not None
        expected_span_ids.add(format(span.context.span_id, "016x"))
    assert {event["properties"]["$ai_span_id"] for event in generations} == expected_span_ids
    assert len(traces) == 1
    assert all(call.kwargs["distinct_id"] == "tracking-test-user" for call in client.capture.call_args_list)


@pytest.mark.anyio
@pytest.mark.parametrize("provider_name", ["openai", "anthropic"])
async def test_provider_chat_spans_reach_tracking(
    provider_name: str, tracking_capture: tuple[TracerProvider, Mock, InMemorySpanExporter]
) -> None:
    tracer_provider, _, _ = tracking_capture
    async with httpx.AsyncClient(transport=httpx.MockTransport(_model_response)) as client:
        if provider_name == "anthropic":
            model = AnthropicModel(
                "claude-test",
                provider=AnthropicProvider(api_key="test", base_url="https://model.test", http_client=client),
            )
        else:
            model = OpenAIChatModel(
                "gpt-test", provider=OpenAIProvider(api_key="test", base_url="https://model.test", http_client=client)
            )
        agent = Agent(
            model, capabilities=[Instrumentation(settings=InstrumentationSettings(tracer_provider=tracer_provider))]
        )
        result = await agent.run("Say hello")
    assert result.output == "hello"
    _assert_tracking(tracking_capture, expected_generations=1)


@pytest.mark.anyio
async def test_streamed_chat_spans_reach_tracking(
    tracking_capture: tuple[TracerProvider, Mock, InMemorySpanExporter],
) -> None:
    tracer_provider, _, _ = tracking_capture
    agent = Agent(
        "test", capabilities=[Instrumentation(settings=InstrumentationSettings(tracer_provider=tracer_provider))]
    )
    with agent.override(model=TestModel(custom_output_text="hello")):
        async with agent.run_stream("Say hello") as result:
            chunks = [chunk async for chunk in result.stream_text(debounce_by=None)]
            assert await result.get_output() == "hello"
    assert chunks
    _assert_tracking(tracking_capture, expected_generations=1)


def _sample_tool() -> str:
    return "tool result"


@pytest.mark.anyio
async def test_tool_spans_do_not_create_generation_events(
    tracking_capture: tuple[TracerProvider, Mock, InMemorySpanExporter],
) -> None:
    tracer_provider, _, exporter = tracking_capture
    agent = Agent(
        "test",
        tools=[_sample_tool],
        capabilities=[Instrumentation(settings=InstrumentationSettings(tracer_provider=tracer_provider))],
    )
    with agent.override(model=TestModel(custom_output_text="hello")):
        result = await agent.run("Call the tool and say hello")
    assert result.output == "hello"
    assert any(
        (span.attributes or {}).get("gen_ai.operation.name") == "execute_tool" for span in exporter.get_finished_spans()
    )
    _assert_tracking(tracking_capture, expected_generations=2)
