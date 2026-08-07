"""Behavioural lock: the router's capability decision reaches the right delegate.

No real LLM — a :class:`TestModel` feeds the orchestrator's classifier a scripted
``_RouteDecision`` as JSON, and we assert which delegate handled it. Built on the
real descriptor list (via ``build_descriptors``) with each agent's ``orchestrate``
swapped for a recording spy, so the test stays honest to whatever agents are
actually registered.
"""

from __future__ import annotations

import json

import pytest
from pydantic_ai.models.test import TestModel
from pydantic_ai.profiles import ModelProfile

from stirling.agents import OrchestratorAgent, build_descriptors
from stirling.agents.registry import AgentDescriptor, OrchestratorRoute, RegisterableAgent
from stirling.contracts import (
    EditCannotDoResponse,
    EditPlanResponse,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfQuestionNotFoundResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
)
from stirling.services.runtime import AppRuntime

_NATIVE_PROFILE = ModelProfile(supports_json_schema_output=True)

_REACHED: list[SupportedCapability] = []


class _SpyAgent(RegisterableAgent):
    """Registers a real delegate route but records the reach and returns a fixed
    sentinel instead of doing work."""

    def __init__(self, capability: SupportedCapability, response: OrchestratorResponse) -> None:
        self._capability = capability
        self._response = response

    def describe(self) -> AgentDescriptor:
        return AgentDescriptor(
            orchestrator=OrchestratorRoute(
                capability=self._capability,
                description=f"spy for {self._capability.value}",
                orchestrate=self._orchestrate,
            ),
        )

    async def _orchestrate(self, _request: OrchestratorRequest) -> OrchestratorResponse:
        _REACHED.append(self._capability)
        return self._response


def _spies() -> list[RegisterableAgent]:
    return [
        _SpyAgent(SupportedCapability.PDF_EDIT, EditCannotDoResponse(reason="spy")),
        _SpyAgent(SupportedCapability.PDF_QUESTION, PdfQuestionNotFoundResponse(reason="spy")),
        _SpyAgent(SupportedCapability.PDF_REVIEW, EditPlanResponse(summary="", steps=[])),
        _SpyAgent(SupportedCapability.PDF_CREATE, EditPlanResponse(summary="", steps=[])),
    ]


async def _route(runtime: AppRuntime, decision: dict[str, str]) -> OrchestratorResponse:
    _REACHED.clear()
    orchestrator = OrchestratorAgent(runtime, build_descriptors(_spies()))
    scripted = TestModel(profile=_NATIVE_PROFILE, custom_output_text=json.dumps(decision))
    with orchestrator._router.override(model=scripted):
        return await orchestrator.handle(OrchestratorRequest(user_message="x"))


@pytest.mark.anyio
async def test_router_reaches_edit_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, {"capability": "pdf_edit"})
    assert _REACHED == [SupportedCapability.PDF_EDIT]
    assert isinstance(response, EditCannotDoResponse)


@pytest.mark.anyio
async def test_router_reaches_question_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, {"capability": "pdf_question"})
    assert _REACHED == [SupportedCapability.PDF_QUESTION]
    assert isinstance(response, PdfQuestionNotFoundResponse)


@pytest.mark.anyio
async def test_router_reaches_review_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, {"capability": "pdf_review"})
    assert _REACHED == [SupportedCapability.PDF_REVIEW]
    assert isinstance(response, EditPlanResponse)


@pytest.mark.anyio
async def test_router_reaches_create_delegate(runtime: AppRuntime) -> None:
    response = await _route(runtime, {"capability": "pdf_create"})
    assert _REACHED == [SupportedCapability.PDF_CREATE]
    assert isinstance(response, EditPlanResponse)


@pytest.mark.anyio
async def test_router_orchestrate_pick_is_unsupported(runtime: AppRuntime) -> None:
    # 'orchestrate' is the escape hatch: it has no delegate, so it surfaces as unsupported.
    response = await _route(runtime, {"capability": "orchestrate", "message": "no fit"})
    assert _REACHED == []
    assert isinstance(response, UnsupportedCapabilityResponse)
    assert response.message == "no fit"


@pytest.mark.anyio
async def test_resume_dispatches_to_matching_delegate(runtime: AppRuntime) -> None:
    _REACHED.clear()
    orchestrator = OrchestratorAgent(runtime, build_descriptors(_spies()))
    await orchestrator.handle(OrchestratorRequest(user_message="x", resume_with=SupportedCapability.PDF_REVIEW))
    assert _REACHED == [SupportedCapability.PDF_REVIEW]


@pytest.mark.anyio
async def test_resume_with_unroutable_capability_raises(runtime: AppRuntime) -> None:
    # MATH_AUDITOR_AGENT is MCP-only — not an orchestrator delegate, so it has no
    # route and resuming into it must raise.
    orchestrator = OrchestratorAgent(runtime, build_descriptors(_spies()))
    with pytest.raises(ValueError, match="Cannot resume"):
        await orchestrator.handle(
            OrchestratorRequest(user_message="x", resume_with=SupportedCapability.MATH_AUDITOR_AGENT)
        )
