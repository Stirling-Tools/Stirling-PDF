"""Thin Ollama client for the routing eval.

The eval talks to ``/v1/chat/completions`` directly rather than through pydantic-ai so it
can drive knobs pydantic-ai does not surface (``reasoning_effort``) and can measure the
reasoning tokens Ollama reports outside ``completion_tokens``. The prompts themselves are
imported from the production orchestrator, so what is measured is the real prompt.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import httpx

DEFAULT_BASE_URL = "http://localhost:11434/v1/chat/completions"
DEFAULT_MODEL = "qwen3:8b"


@dataclass
class CallResult:
    """One model round trip."""

    content: str
    latency_s: float
    input_tokens: int
    output_tokens: int
    # Ollama returns qwen3's chain of thought in a separate `reasoning` field and (except
    # when the cap truncates) leaves it out of completion_tokens, so it is counted here.
    thinking_chars: int
    finish_reason: str
    error: str | None = None


@dataclass
class Budget:
    """Running totals for one strategy run over one case."""

    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_chars: int = 0
    latency_s: float = 0.0
    errors: list[str] = field(default_factory=list)

    def add(self, result: CallResult) -> None:
        self.calls += 1
        self.input_tokens += result.input_tokens
        self.output_tokens += result.output_tokens
        self.thinking_chars += result.thinking_chars
        self.latency_s += result.latency_s
        if result.error:
            self.errors.append(result.error)


def enum_schema(name: str, values: list[str], *, with_message: bool = False) -> dict[str, Any]:
    """A json-schema response format holding a single enum choice.

    Mirrors what pydantic-ai's NativeOutput sends for the router's ``_RouteDecision``.
    """
    properties: dict[str, Any] = {"capability": {"type": "string", "enum": values}}
    required = ["capability"]
    if with_message:
        properties["message"] = {"type": "string"}
        required.append("message")
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


class OllamaRouter:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
    ) -> None:
        self._client = client
        self._model = model
        self._base_url = base_url

    async def call(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        response_format: dict[str, Any] | None,
        max_tokens: int,
        temperature: float | None,
        thinking: bool,
    ) -> CallResult:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            body["response_format"] = response_format
        if temperature is not None:
            body["temperature"] = temperature
        if not thinking:
            # The only knob Ollama honours on the OpenAI-compatible path for qwen3.
            # chat_template_kwargs{enable_thinking} and a /no_think suffix are both ignored.
            body["reasoning_effort"] = "none"

        started = time.monotonic()
        try:
            response = await self._client.post(self._base_url, json=body, timeout=600.0)
        except httpx.HTTPError as exc:
            return CallResult("", time.monotonic() - started, 0, 0, 0, "transport", f"{type(exc).__name__}: {exc}")
        elapsed = time.monotonic() - started

        try:
            payload = response.json()
        except ValueError:
            return CallResult("", elapsed, 0, 0, 0, "bad-json", f"HTTP {response.status_code}: non-JSON body")
        if "choices" not in payload:
            return CallResult("", elapsed, 0, 0, 0, "no-choices", f"HTTP {response.status_code}: {payload}"[:400])

        choice = payload["choices"][0]
        message = choice.get("message") or {}
        usage = payload.get("usage") or {}
        reasoning = message.get("reasoning") or message.get("reasoning_content") or ""
        return CallResult(
            content=message.get("content") or "",
            latency_s=elapsed,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            thinking_chars=len(reasoning),
            finish_reason=str(choice.get("finish_reason") or ""),
        )
