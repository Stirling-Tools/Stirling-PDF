"""Provider-aware output: Ollama/custom block tools under native json-schema, so use ToolOutput not NativeOutput."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from pydantic_ai.output import NativeOutput, ToolOutput

# Providers whose OpenAI-compatible endpoint needs tool-delivered structured output.
_TOOL_OUTPUT_PROVIDERS = frozenset({"ollama", "custom"})


def uses_tool_output(chat_provider: str) -> bool:
    return chat_provider in _TOOL_OUTPUT_PROVIDERS


def structured_output(output_types: Sequence[Any], *, chat_provider: str) -> Any:
    """Pick a structured-output spec compatible with the active chat provider."""
    types = list(output_types)
    if uses_tool_output(chat_provider):
        return [ToolOutput(t) for t in types]
    return NativeOutput(types)


def output_retries(chat_provider: str, *, native: int = 1, tool: int = 6) -> int:
    """Local models delivering via ToolOutput need more output-validation retries."""
    return tool if uses_tool_output(chat_provider) else native
