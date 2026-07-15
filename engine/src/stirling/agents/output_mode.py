"""Provider-aware structured-output strategy.

OpenAI-compatible local models (Ollama, and 'custom' OpenAI-compatible endpoints)
block tool-calling whenever a native json-schema ``response_format`` is set: the
API constrains every completion to the output schema, so the model can never emit
a tool-call turn. Agents that combine structured output with tools (RAG search,
whole-document read, etc.) therefore get an ungrounded answer - the model fills the
schema directly instead of calling a retrieval tool.

Delivering the structured result via a tool call (:class:`ToolOutput`) sidesteps
this: it's all tool-calling, which these endpoints handle, so the model can call a
retrieval tool and then the output tool. Real providers (Anthropic, OpenAI) keep
:class:`NativeOutput`, which is unaffected and preferred there.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from pydantic_ai.output import NativeOutput, ToolOutput

# Providers whose OpenAI-compatible endpoint needs tool-delivered structured output.
_TOOL_OUTPUT_PROVIDERS = frozenset({"ollama", "custom"})


def uses_tool_output(chat_provider: str) -> bool:
    return chat_provider in _TOOL_OUTPUT_PROVIDERS


def structured_output(output_types: Sequence[Any], *, chat_provider: str) -> Any:
    """Pick a structured-output spec compatible with the active chat provider.

    Ollama/custom deliver each output variant via a :class:`ToolOutput`; every other
    provider uses a single :class:`NativeOutput` over the variants.
    """
    types = list(output_types)
    if uses_tool_output(chat_provider):
        return [ToolOutput(t) for t in types]
    return NativeOutput(types)


def output_retries(chat_provider: str, *, native: int = 1, tool: int = 6) -> int:
    """Local models delivering via ToolOutput need more output-validation retries -
    small models produce valid complex/nested structured output only intermittently."""
    return tool if uses_tool_output(chat_provider) else native
