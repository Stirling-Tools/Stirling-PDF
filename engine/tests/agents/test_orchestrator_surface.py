from __future__ import annotations

import pytest

from stirling.agents import OrchestratorAgent
from stirling.agents.orchestrator import (
    _CAPABILITY_BY_ROUTE,
    _DOCUMENT_CAPABILITIES,
    _ROUTE_NAME,
    _RouteDecision,
    _router_instructions,
)
from stirling.agents.surface import _EDITOR_CAPABILITIES, allows, capabilities_for
from stirling.contracts import (
    AssistantSurface,
    OrchestratorRequest,
    PdfEditResponse,
    SupportedCapability,
    WorkflowOutcome,
)
from stirling.services.runtime import AppRuntime


def test_surface_defaults_to_editor_when_absent() -> None:
    assert OrchestratorRequest.model_validate({"userMessage": "hi"}).surface is AssistantSurface.EDITOR


def test_surface_round_trips_its_alias() -> None:
    request = OrchestratorRequest.model_validate({"userMessage": "hi", "surface": "processor"})
    assert request.surface is AssistantSurface.PROCESSOR
    assert request.model_dump(by_alias=True)["surface"] == "processor"


@pytest.mark.parametrize("value", ["", "EDITOR", "workbench", None, 7, {"a": 1}])
def test_unknown_surface_coerces_to_editor_rather_than_failing(value: object) -> None:
    """Version drift in either direction must not 4xx a chat turn, nor silently narrow."""
    assert (
        OrchestratorRequest.model_validate({"userMessage": "hi", "surface": value}).surface is AssistantSurface.EDITOR
    )


def test_no_surface_can_exceed_the_editor_set() -> None:
    """The intersection in capabilities_for is what makes widening structurally impossible."""
    for surface in AssistantSurface:
        assert capabilities_for(surface) <= _EDITOR_CAPABILITIES


def test_processor_keeps_only_agent_drafting() -> None:
    assert capabilities_for(AssistantSurface.PROCESSOR) == frozenset({SupportedCapability.AGENT_DRAFT})
    for capability in _DOCUMENT_CAPABILITIES:
        assert not allows(AssistantSurface.PROCESSOR, capability)


def test_every_route_name_maps_back_to_its_capability() -> None:
    """Guards the reverse map used by the enum-router gate."""
    assert _CAPABILITY_BY_ROUTE == {name: cap for cap, name in _ROUTE_NAME.items()}
    assert set(_CAPABILITY_BY_ROUTE) == set(_ROUTE_NAME.values())


def test_editor_output_types_cover_every_delegate(runtime: AppRuntime) -> None:
    agent = OrchestratorAgent(runtime)
    names = {output.name for output in agent._output_types(capabilities_for(AssistantSurface.EDITOR))}
    # Catches a delegate added to the map but missing from the editor capability set.
    assert names == {f"delegate_{route}" for route in _ROUTE_NAME.values()} | {"unsupported_capability"}


def test_processor_output_types_are_draft_and_refusal_only(runtime: AppRuntime) -> None:
    agent = OrchestratorAgent(runtime)
    names = {output.name for output in agent._output_types(capabilities_for(AssistantSurface.PROCESSOR))}
    assert names == {"delegate_user_spec", "unsupported_capability"}


def test_refusal_output_survives_every_narrowing(runtime: AppRuntime) -> None:
    """An empty output_type is not a valid agent, so the refusal is never filtered out."""
    agent = OrchestratorAgent(runtime)
    for surface in AssistantSurface:
        names = {output.name for output in agent._output_types(capabilities_for(surface))}
        assert "unsupported_capability" in names


def test_processor_router_prompt_drops_document_bullets_and_examples() -> None:
    prompt = _router_instructions(capabilities_for(AssistantSurface.PROCESSOR))
    for route in ("pdf_edit", "pdf_question", "pdf_review", "pdf_create"):
        assert route not in prompt
    assert "user_spec" in prompt
    assert "no file workspace" in prompt


def test_editor_router_prompt_keeps_every_bullet_and_example() -> None:
    prompt = _router_instructions(capabilities_for(AssistantSurface.EDITOR))
    for route in _ROUTE_NAME.values():
        assert route in prompt
    assert "Decide by what the user wants BACK" in prompt
    assert "no file workspace" not in prompt


@pytest.mark.anyio
async def test_processor_resume_into_pdf_edit_is_declined(runtime: AppRuntime, monkeypatch: pytest.MonkeyPatch) -> None:
    """The resume path never calls a model, so it must be gated before the resume branch."""
    agent = OrchestratorAgent(runtime)

    async def explode(_request: OrchestratorRequest) -> PdfEditResponse:
        raise AssertionError("pdf_edit must not run on the processor surface")

    monkeypatch.setattr(agent, "_run_pdf_edit", explode)
    response = await agent.handle(
        OrchestratorRequest(
            user_message="rotate it",
            surface=AssistantSurface.PROCESSOR,
            resume_with=SupportedCapability.PDF_EDIT,
        )
    )
    assert response.outcome is WorkflowOutcome.UNSUPPORTED_CAPABILITY
    assert response.capability == "document_work"
    assert "editor" in response.message


@pytest.mark.anyio
async def test_processor_resume_into_agent_draft_still_runs(
    runtime: AppRuntime, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The gate is a subtraction, not a blanket block."""
    agent = OrchestratorAgent(runtime)
    ran: list[str] = []

    async def capture(request: OrchestratorRequest) -> object:
        ran.append(request.user_message)
        return object()

    monkeypatch.setattr(agent, "_run_agent_draft", capture)
    await agent.handle(
        OrchestratorRequest(
            user_message="stamp every upload",
            surface=AssistantSurface.PROCESSOR,
            resume_with=SupportedCapability.AGENT_DRAFT,
        )
    )
    assert ran == ["stamp every upload"]


@pytest.mark.anyio
async def test_editor_resume_into_pdf_edit_is_untouched(runtime: AppRuntime, monkeypatch: pytest.MonkeyPatch) -> None:
    agent = OrchestratorAgent(runtime)
    ran: list[str] = []

    async def capture(request: OrchestratorRequest) -> object:
        ran.append(request.user_message)
        return object()

    monkeypatch.setattr(agent, "_run_pdf_edit", capture)
    await agent.handle(
        OrchestratorRequest(
            user_message="rotate it",
            resume_with=SupportedCapability.PDF_EDIT,
        )
    )
    assert ran == ["rotate it"]


@pytest.mark.anyio
async def test_enum_router_choosing_a_document_capability_is_still_declined(
    runtime: AppRuntime, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The narrowed schema should stop this, but a local model that ignores its schema must not
    become the one path that skips the gate."""
    agent = OrchestratorAgent(runtime)

    async def explode(_request: OrchestratorRequest) -> PdfEditResponse:
        raise AssertionError("pdf_edit must not run on the processor surface")

    monkeypatch.setattr(agent, "_run_pdf_edit", explode)

    class _Result:
        output = _RouteDecision(capability="pdf_edit")

    class _Router:
        async def run(self, *_args: object, **_kwargs: object) -> _Result:
            return _Result()

    monkeypatch.setattr(agent, "_router", _Router())
    response = await agent.handle(OrchestratorRequest(user_message="rotate it", surface=AssistantSurface.PROCESSOR))
    assert response.outcome is WorkflowOutcome.UNSUPPORTED_CAPABILITY
    assert response.capability == "document_work"
