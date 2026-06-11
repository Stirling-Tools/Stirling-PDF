"""Behavioural lock: a scripted top-level tool call reaches the right delegate.

No real LLM — a :class:`FunctionModel` scripts the exact tool call the orchestrator
would have received, and we assert which delegate handled it. Built on the real
descriptor list (via ``build_descriptors``) with each agent's ``orchestrate``
swapped for a recording spy, so the test stays honest to whatever agents are
actually registered.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from stirling.agents import OrchestratorAgent, build_descriptors
from stirling.agents._registry import AgentDescriptor, OrchestratorRoute, RegisterableAgent
from stirling.contracts import (
    ConvertMarkdownResponse,
    EditCannotDoResponse,
    EditPlanResponse,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfQuestionNotFoundResponse,
    SupportedCapability,
)
from stirling.services.runtime import AppRuntime

_REACHED: list[SupportedCapability] = []


class _SpyAgent(RegisterableAgent):
    """Stand-in agent that reproduces a real delegate's tool surface but records
    the reach and returns a fixed sentinel instead of doing work."""

    def __init__(
        self,
        capability: SupportedCapability,
        tool_name: str,
        response: OrchestratorResponse,
    ) -> None:
        self._capability = capability
        self._tool_name = tool_name
        self._response = response

    def describe(self) -> AgentDescriptor:
        return AgentDescriptor(
            orchestrator=OrchestratorRoute(
                capability=self._capability,
                tool_name=self._tool_name,
                tool_description=f"spy for {self._tool_name}",
                orchestrate=self._orchestrate,
            ),
        )

    async def _orchestrate(self, _request: OrchestratorRequest) -> OrchestratorResponse:
        _REACHED.append(self._capability)
        return self._response


def _spies() -> list[RegisterableAgent]:
    return [
        _SpyAgent(SupportedCapability.PDF_EDIT, "delegate_pdf_edit", EditCannotDoResponse(reason="spy")),
        _SpyAgent(
            SupportedCapability.PDF_QUESTION,
            "delegate_pdf_question",
            PdfQuestionNotFoundResponse(reason="spy"),
        ),
        _SpyAgent(SupportedCapability.PDF_REVIEW, "delegate_pdf_review", EditPlanResponse(summary="", steps=[])),
    ]


def _script(tool_name: str) -> Callable[[list[ModelMessage], AgentInfo], ModelResponse]:
    def call(_messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart(tool_name=tool_name, args={})])

    return call


async def _route(runtime: AppRuntime, tool_name: str) -> OrchestratorResponse:
    _REACHED.clear()
    scripted = replace(runtime, fast_model=FunctionModel(_script(tool_name)))
    orchestrator = OrchestratorAgent(scripted, build_descriptors(_spies()))
    return await orchestrator.handle(OrchestratorRequest(user_message="x"))


@pytest.mark.anyio
async def test_delegate_pdf_edit_reaches_edit_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, "delegate_pdf_edit")
    assert _REACHED == [SupportedCapability.PDF_EDIT]
    assert isinstance(response, EditCannotDoResponse)


@pytest.mark.anyio
async def test_delegate_pdf_question_reaches_question_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, "delegate_pdf_question")
    assert _REACHED == [SupportedCapability.PDF_QUESTION]
    assert isinstance(response, PdfQuestionNotFoundResponse)


@pytest.mark.anyio
async def test_delegate_pdf_review_reaches_review_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, "delegate_pdf_review")
    assert _REACHED == [SupportedCapability.PDF_REVIEW]
    assert isinstance(response, EditPlanResponse)


@pytest.mark.anyio
async def test_delegate_pdf_ingest_returns_convert_markdown(runtime: AppRuntime) -> None:
    # pdf_ingest is the canned descriptor appended by build_descriptors — no agent,
    # no reach recorded, just a deterministic convert response.
    response = await _route(runtime, "delegate_pdf_ingest")
    assert _REACHED == []
    assert isinstance(response, ConvertMarkdownResponse)


@pytest.mark.anyio
async def test_resume_dispatches_to_matching_delegate(runtime: AppRuntime) -> None:
    _REACHED.clear()
    orchestrator = OrchestratorAgent(runtime, build_descriptors(_spies()))
    await orchestrator.handle(OrchestratorRequest(user_message="x", resume_with=SupportedCapability.PDF_REVIEW))
    assert _REACHED == [SupportedCapability.PDF_REVIEW]


@pytest.mark.anyio
async def test_resume_with_non_resumable_capability_raises(runtime: AppRuntime) -> None:
    orchestrator = OrchestratorAgent(runtime, build_descriptors(_spies()))
    with pytest.raises(ValueError, match="Cannot resume"):
        await orchestrator.handle(
            OrchestratorRequest(user_message="x", resume_with=SupportedCapability.PDF_TO_MARKDOWN)
        )
