from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from stirling.models import UserId
from stirling.services import tracking


def test_require_current_user_id_fails_closed_and_returns_context_value() -> None:
    with pytest.raises(RuntimeError, match="X-User-Id"):
        tracking.require_current_user_id()

    token = tracking.current_user_id.set(UserId("user-123"))
    try:
        assert tracking.require_current_user_id() == "user-123"
    finally:
        tracking.current_user_id.reset(token)


def test_lru_set_refreshes_existing_entries_and_evicts_oldest() -> None:
    values = tracking.LRUSet(max_size=2)
    values.add("a")
    values.add("b")
    values.add("c")

    assert "a" not in values
    assert "b" in values
    assert "c" in values


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("not-json", None), (json.dumps({"ok": True}), {"ok": True})],
)
def test_parse_json_attr_handles_missing_invalid_and_valid_values(value: object, expected: object) -> None:
    assert tracking._parse_json_attr({"key": value}, "key") == expected


def test_transform_output_choices_converts_tool_calls_and_preserves_plain_choices() -> None:
    choices = [
        {"role": "assistant", "parts": [{"type": "tool_call", "id": "call-1", "name": "search"}]},
        {"role": "assistant", "content": "already plain"},
        "not-a-choice",
    ]

    transformed = tracking._transform_output_choices(choices)

    assert transformed[0]["content"] == [{"type": "tool_call", "id": "call-1", "name": "search"}]
    assert transformed[0]["tool_calls"] == [{"type": "function", "id": "call-1", "function": {"name": "search"}}]
    assert transformed[1] == choices[1]
    assert transformed[2] == "not-a-choice"


def test_extract_user_message_returns_last_user_text() -> None:
    attrs = {
        tracking.GEN_AI_INPUT_MESSAGES: json.dumps(
            [
                {"role": "user", "parts": [{"type": "text", "content": "first"}]},
                {"role": "assistant", "parts": [{"type": "text", "content": "answer"}]},
                {"role": "user", "parts": [{"type": "text", "content": "last"}]},
            ]
        )
    }

    assert tracking._extract_user_message(attrs) == "last"
    assert tracking._extract_user_message({}) == ""


def test_processor_property_helpers_add_optional_values() -> None:
    properties: dict[str, object] = {}
    attrs = {
        tracking.GEN_AI_INPUT_MESSAGES: json.dumps([{"role": "user"}]),
        tracking.GEN_AI_OUTPUT_MESSAGES: json.dumps(
            [{"role": "assistant", "parts": [{"type": "text", "content": "done"}]}]
        ),
        tracking.GEN_AI_REQUEST_TEMPERATURE: 0.2,
        tracking.GEN_AI_REQUEST_MAX_TOKENS: 100,
        tracking.GEN_AI_TOOL_DEFINITIONS: json.dumps([{"name": "search"}]),
        tracking.SERVER_ADDRESS: "llm.example",
        tracking.SERVER_PORT: 443,
    }

    tracking.PostHogSpanProcessor._add_message_properties(properties, attrs)
    tracking.PostHogSpanProcessor._add_model_parameters(properties, attrs)
    tracking.PostHogSpanProcessor._add_tool_definitions(properties, attrs)
    tracking.PostHogSpanProcessor._add_base_url(properties, attrs)

    assert properties["$ai_input"] == [{"role": "user"}]
    output_choices = properties["$ai_output_choices"]
    assert isinstance(output_choices, list)
    assert isinstance(output_choices[0], dict)
    assert output_choices[0]["content"] == [{"type": "text", "content": "done"}]
    assert properties["$ai_model_parameters"] == {"temperature": 0.2, "max_tokens": 100}
    assert properties["$ai_tools"] == [{"name": "search"}]
    assert properties["$ai_base_url"] == "llm.example:443"


def test_processor_emits_generation_and_one_trace_event_per_trace() -> None:
    class Client:
        def __init__(self) -> None:
            self.events: list[dict[str, object]] = []

        def capture(self, **event: object) -> None:
            self.events.append(event)

    client = Client()
    processor = tracking.PostHogSpanProcessor(client)  # type: ignore[arg-type]
    context = SimpleNamespace(trace_id=1, span_id=2)
    parent = SimpleNamespace(span_id=3)
    span = SimpleNamespace(
        attributes={
            tracking.GEN_AI_OPERATION_NAME: tracking.GenAiOperationNameValues.CHAT.value,
            tracking.GEN_AI_SYSTEM: "provider",
            tracking.GEN_AI_RESPONSE_MODEL: "model",
            tracking.GEN_AI_INPUT_MESSAGES: json.dumps(
                [{"role": "user", "parts": [{"type": "text", "content": "question"}]}]
            ),
        },
        context=context,
        parent=parent,
        start_time=1,
        end_time=1_000_000_001,
    )

    token = tracking.current_user_id.set(UserId("user-123"))
    try:
        processor.on_end(span)  # type: ignore[arg-type]
        processor.on_end(span)  # type: ignore[arg-type]
    finally:
        tracking.current_user_id.reset(token)

    assert [event["event"] for event in client.events] == ["$ai_trace", "$ai_generation", "$ai_generation"]
    assert client.events[0]["distinct_id"] == "user-123"
    properties = client.events[0]["properties"]
    assert isinstance(properties, dict)
    assert properties["$ai_trace_name"] == "question"


def test_processor_ignores_non_chat_spans_and_flushes_client() -> None:
    class Client:
        def __init__(self) -> None:
            self.flushed = False
            self.shutdown_called = False

        def flush(self) -> None:
            self.flushed = True

        def shutdown(self) -> None:
            self.shutdown_called = True

    client = Client()
    processor = tracking.PostHogSpanProcessor(client)  # type: ignore[arg-type]
    span = SimpleNamespace(attributes={tracking.GEN_AI_OPERATION_NAME: "embedding"})

    processor.on_end(span)  # type: ignore[arg-type]
    assert processor.force_flush() is True
    processor.shutdown()
    assert client.flushed
    assert client.shutdown_called
