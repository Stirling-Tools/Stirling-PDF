from __future__ import annotations

import json
import time
from collections.abc import Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import UTC, datetime

from anthropic._exceptions import OverloadedError
from langchain_core.messages import BaseMessage
from langchain_core.messages.base import message_to_dict, messages_to_dict
from pydantic import BaseModel

from config import (
    AI_MESSAGES_LOG_PATH,
    AI_RAW_DEBUG,
    AI_REQUEST_TIMEOUT_SECONDS,
    POSTHOG_CALLBACK,
    get_chat_model,
    logger,
)
from langchain_utils import to_lc_messages
from models import ChatMessage


class AIProviderOverloadedError(RuntimeError):
    pass


def _write_debug_payload(payload: dict[str, object]) -> None:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    file_path = AI_MESSAGES_LOG_PATH / f"{timestamp}.json"
    file_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2, default=str) + "\n", encoding="utf-8")


class StreamResult:
    def __init__(
        self,
        *,
        model: str,
        messages: Sequence[ChatMessage],
        tag: str,
        max_tokens: int | None,
        log_exchange: bool,
        log_timing: bool,
        log_label: str,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self._model = model
        self._messages = messages
        self._tag = tag
        self._max_tokens = max_tokens
        self._log_exchange = log_exchange
        self._log_timing = log_timing
        self._log_label = log_label
        self._user_id = user_id
        self._session_id = session_id
        self.chunks: list[str] = []
        self.error: Exception | None = None

    def __iter__(self) -> Iterator[str]:
        label = self._log_label or self._tag or "stream"
        try:
            llm = get_chat_model(self._model, streaming=True, max_tokens=self._max_tokens)
            start = time.perf_counter()
            first_chunk = None
            chunk_count = 0
            total_chars = 0
            for chunk in llm.stream(to_lc_messages(self._messages)):
                if not chunk.content:
                    continue
                if first_chunk is None:
                    first_chunk = time.perf_counter()
                content = chunk.content
                if not isinstance(content, str):
                    raise TypeError(f"Expected string chunk, got: {type(content)}")
                chunk_count += 1
                total_chars += len(content)
                self.chunks.append(content)
                yield content
            elapsed = time.perf_counter() - start
            if self._log_timing:
                logger.info(
                    "[AI] %s model=%s elapsed=%.2fs first_chunk=%.2fs chunks=%s chars=%s",
                    label,
                    self._model,
                    elapsed,
                    (first_chunk - start) if first_chunk else -1.0,
                    chunk_count,
                    total_chars,
                )
        except Exception as exc:
            self.error = exc
            logger.error("[AI] %s stream failed: %s", label, exc, exc_info=True)


def stream_ai(
    model: str,
    messages: Sequence[ChatMessage],
    *,
    max_tokens: int | None = None,
    tag: str = "",
    log_exchange: bool = True,
    log_timing: bool = True,
    log_label: str = "",
    user_id: str | None = None,
    session_id: str | None = None,
) -> StreamResult:
    return StreamResult(
        model=model,
        messages=messages,
        tag=tag,
        max_tokens=max_tokens,
        log_exchange=log_exchange,
        log_timing=log_timing,
        log_label=log_label,
        user_id=user_id,
        session_id=session_id,
    )


def _invoke[T: BaseModel](
    model_name: str,
    messages: Sequence[ChatMessage],
    schema: type[T],
    *,
    max_tokens: int | None,
    ai_request_timeout: float,
) -> tuple[T, float]:
    llm = get_chat_model(model_name, max_tokens=max_tokens)
    structured_llm = llm.with_structured_output(schema, include_raw=AI_RAW_DEBUG)
    lc_messages = to_lc_messages(messages)
    start = time.perf_counter()

    # Pass callbacks directly to invoke() to ensure they're used
    if ai_request_timeout > 0:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(structured_llm.invoke, lc_messages, config={"callbacks": [POSTHOG_CALLBACK]})
            try:
                response = future.result(timeout=ai_request_timeout)
            except FutureTimeout as exc:
                raise TimeoutError(f"AI request timed out after {ai_request_timeout:.0f}s") from exc
    else:
        response = structured_llm.invoke(lc_messages, config={"callbacks": [POSTHOG_CALLBACK]})
    elapsed = time.perf_counter() - start

    if AI_RAW_DEBUG:
        assert isinstance(response, dict), f"Expected include_raw response dict, got: {type(response)}"
        raw_value: BaseMessage = response["raw"]
        parsed_value: T | None = response["parsed"]
        parsing_error: BaseException | None = response["parsing_error"]
        exchange = {
            "model": model_name,
            "schema": schema.__name__,
            "elapsed_s": elapsed,
            "settings": {
                "max_tokens": max_tokens,
                "ai_request_timeout_s": ai_request_timeout,
                "include_raw": True,
            },
            "request": messages_to_dict(lc_messages),
            "response": {
                "raw": message_to_dict(raw_value),
                "parsed": parsed_value.model_dump(mode="json") if parsed_value else None,
                "parsing_error": str(parsing_error) if parsing_error else None,
            },
        }
        _write_debug_payload(exchange)

        if parsing_error:
            raise parsing_error
        parsed = parsed_value
    else:
        parsed = response

    assert isinstance(parsed, schema), f"Expected {schema.__name__}: {parsed}"
    return parsed, elapsed


def run_ai[T: BaseModel](
    model: str,
    messages: Sequence[ChatMessage],
    schema: type[T],
    *,
    max_tokens: int | None = None,
    tag: str = "",
    log_exchange: bool = True,
    log_timing: bool = True,
    log_label: str = "",
    user_id: str | None = None,
    session_id: str | None = None,
) -> T:
    label = log_label or tag or schema.__name__
    log_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    try:
        parsed, elapsed = _invoke(
            model,
            messages,
            schema,
            max_tokens=max_tokens,
            ai_request_timeout=AI_REQUEST_TIMEOUT_SECONDS,
        )
    except OverloadedError as exc:
        elapsed = 0.0
        if log_timing:
            logger.info(f"[AI] {log_id=} {label} {model=} {elapsed=:.2f}s chars=0")
        raise AIProviderOverloadedError("AI provider is currently overloaded. Please retry in a moment.") from exc
    except Exception:
        elapsed = 0.0
        if log_timing:
            logger.info(f"[AI] {log_id=} {label} {model=} {elapsed=:.2f}s chars=0")
        raise

    if log_timing:
        chars = len(str(parsed))
        logger.info(f"[AI] {log_id=} {label} {model=} {elapsed=:.2f}s {chars=}")
    return parsed


__all__ = ["run_ai", "stream_ai", "StreamResult", "AIProviderOverloadedError"]
