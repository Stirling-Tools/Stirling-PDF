"""Behavioural tests that the orchestrator routes each capability to the right delegate.

These tests deliberately avoid the LLM: the ``resume_with`` path doesn't consult a model,
and the routing path uses ``FunctionModel`` to script the tool call the orchestrator
would have received from the LLM. Each test verifies that the orchestrator's dispatch
reaches the correct underlying delegate for a given capability or tool name.

The test operates on the canonical delegate list produced by ``build_delegates`` —
tests stay honest to whatever agents are actually wired up at startup.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents import (
    OrchestratorAgent,
    PdfEditAgent,
    PdfQuestionAgent,
    UserSpecAgent,
    build_delegates,
)
from stirling.agents._registry import DelegatableAgent, OrchestratorDeps
from stirling.agents.ledger import MathAuditorAgent
from stirling.contracts import (
    OrchestratorRequest,
    OrchestratorResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
)
from stirling.services.runtime import AppRuntime


def _real_delegates(runtime: AppRuntime) -> list[DelegatableAgent]:
    """Build the canonical delegate list against fresh agent instances for tests."""
    return build_delegates(
        [
            PdfEditAgent(runtime),
            PdfQuestionAgent(runtime),
            UserSpecAgent(runtime),
            MathAuditorAgent(runtime),
        ]
    )


class _DelegateSpy:
    """Stands in for a delegate's ``run``/``delegate`` pair while recording which
    capability was reached. Returns a sentinel ``UnsupportedCapabilityResponse``
    tagged with the capability so callers can verify dispatch."""

    def __init__(self, capability: SupportedCapability) -> None:
        self.capability = capability
        self.calls: list[OrchestratorRequest] = []

    async def run(self, request: OrchestratorRequest) -> OrchestratorResponse:
        self.calls.append(request)
        return UnsupportedCapabilityResponse(capability=self.capability.value, message="spy")

    async def delegate(self, ctx: RunContext[OrchestratorDeps]) -> OrchestratorResponse:
        return await self.run(ctx.deps.request)


def _spy_delegates(
    real: list[DelegatableAgent],
) -> tuple[list[DelegatableAgent], dict[SupportedCapability, _DelegateSpy]]:
    """For each registered delegate, return (spied-copy, spy-by-capability).

    The spied copy keeps the real ``capability``, ``tool_name``, and ``tool_description``
    so both the LLM-scripted tool calls and the resume capability lookup hit the
    matching spy; only the underlying behaviour is replaced.
    """
    spies: dict[SupportedCapability, _DelegateSpy] = {}
    delegates: list[DelegatableAgent] = []
    for d in real:
        spy = _DelegateSpy(d.capability)
        spies[d.capability] = spy
        delegates.append(
            DelegatableAgent(
                capability=d.capability,
                tool_output=ToolOutput(
                    spy.delegate,
                    name=d.tool_output.name,
                    description=d.tool_output.description,
                ),
                run=spy.run,
            )
        )
    return delegates, spies


# ---------------------------------------------------------------------------
# Resume path: no LLM consulted; capability → delegate lookup directly
# ---------------------------------------------------------------------------


@pytest.mark.anyio
@pytest.mark.parametrize(
    "capability",
    [SupportedCapability.PDF_EDIT, SupportedCapability.PDF_QUESTION, SupportedCapability.AGENT_DRAFT],
)
async def test_resume_dispatches_to_matching_delegate(runtime: AppRuntime, capability: SupportedCapability) -> None:
    delegates, spies = _spy_delegates(_real_delegates(runtime))
    orchestrator = OrchestratorAgent(runtime, delegates)
    await orchestrator.handle(OrchestratorRequest(user_message="x", file_names=["a.pdf"], resume_with=capability))
    assert len(spies[capability].calls) == 1
    for other, spy in spies.items():
        if other is not capability:
            assert spy.calls == []


@pytest.mark.anyio
async def test_resume_with_unregistered_capability_raises(runtime: AppRuntime) -> None:
    delegates, _ = _spy_delegates(_real_delegates(runtime))
    orchestrator = OrchestratorAgent(runtime, delegates)
    with pytest.raises(ValueError, match="Cannot resume"):
        await orchestrator.handle(
            OrchestratorRequest(
                user_message="x",
                file_names=[],
                resume_with=SupportedCapability.AGENT_REVISE,
            )
        )


# ---------------------------------------------------------------------------
# LLM routing path: FunctionModel scripts the tool call the orchestrator
# would have received from a real model
# ---------------------------------------------------------------------------


def _tool_call_script(tool_name: str) -> Callable[[list[ModelMessage], AgentInfo], ModelResponse]:
    def call(_messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart(tool_name=tool_name, args={})])

    return call


@pytest.mark.anyio
@pytest.mark.parametrize(
    "capability",
    [
        SupportedCapability.PDF_EDIT,
        SupportedCapability.PDF_QUESTION,
        SupportedCapability.AGENT_DRAFT,
        SupportedCapability.MATH_AUDITOR_AGENT,
    ],
)
async def test_llm_tool_call_reaches_matching_delegate(runtime: AppRuntime, capability: SupportedCapability) -> None:
    delegates, spies = _spy_delegates(_real_delegates(runtime))
    target = next(d for d in delegates if d.capability is capability)
    tool_name = target.tool_output.name
    assert tool_name is not None
    scripted = replace(runtime, fast_model=FunctionModel(_tool_call_script(tool_name)))
    orchestrator = OrchestratorAgent(scripted, delegates)
    await orchestrator.handle(OrchestratorRequest(user_message="x", file_names=["a.pdf"]))
    assert len(spies[capability].calls) == 1
    for other, spy in spies.items():
        if other is not capability:
            assert spy.calls == []
