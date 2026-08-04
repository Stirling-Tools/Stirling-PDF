from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from stirling.agents.orchestrator import OrchestratorAgent, _RouteDecision
from stirling.contracts import (
    AiFile,
    ConversationMessage,
    ExtractedFileText,
    ExtractedTextArtifact,
    OrchestratorRequest,
    PdfTextSelection,
    SupportedCapability,
)
from stirling.models import FileId

# The tests intentionally replace the pydantic-ai router with a small async
# fake; those substitutions are runtime-safe but do not match production types.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


def _request(*, artifact: bool = False) -> OrchestratorRequest:
    artifacts = []
    if artifact:
        artifacts.append(
            ExtractedTextArtifact(files=[ExtractedFileText(file_name="a.pdf", pages=[PdfTextSelection(text="page")])])
        )
    return OrchestratorRequest(
        user_message="do something",
        files=[AiFile(id=FileId("file-1"), name="a.pdf")],
        artifacts=artifacts,
    )


def _agent() -> OrchestratorAgent:
    agent = object.__new__(OrchestratorAgent)
    agent.runtime = None
    return agent


def test_build_prompt_describes_history_files_and_artifacts() -> None:
    agent = _agent()
    request = _request(artifact=True).model_copy(
        update={"conversation_history": [ConversationMessage(role="user", content="hi")]}
    )

    prompt = agent._build_prompt(request)

    assert "do something" in prompt
    assert "a.pdf" in prompt
    assert "extracted_text: 1 pages" in prompt
    assert "- user: hi" in prompt
    assert agent._describe_artifacts(_request()) == "- none"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "capability, method",
    [
        (SupportedCapability.PDF_QUESTION, "_run_pdf_question"),
        (SupportedCapability.PDF_REVIEW, "_run_pdf_review"),
        (SupportedCapability.PDF_EDIT, "_run_pdf_edit"),
        (SupportedCapability.AGENT_DRAFT, "_run_agent_draft"),
        (SupportedCapability.PDF_CREATE, "_run_pdf_create"),
    ],
)
async def test_resume_dispatches_each_supported_capability(capability: SupportedCapability, method: str) -> None:
    agent = _agent()
    expected = object()
    handler = AsyncMock(return_value=expected)
    setattr(agent, method, handler)

    result = await agent._resume(_request(), capability)

    assert result is expected
    handler.assert_awaited_once()


@pytest.mark.anyio
async def test_resume_rejects_capabilities_that_cannot_resume() -> None:
    agent = _agent()

    with pytest.raises(ValueError, match="Cannot resume"):
        await agent._resume(_request(), SupportedCapability.ORCHESTRATE)


@pytest.mark.anyio
@pytest.mark.parametrize("capability", ["pdf_edit", "pdf_question", "user_spec", "pdf_review", "pdf_create"])
async def test_enum_router_dispatches_by_capability(capability: str) -> None:
    agent = _agent()
    request = _request()
    decision = _RouteDecision(capability=capability)
    agent._router = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(output=decision)))
    handler = AsyncMock(return_value=object())
    handler_name = {
        "pdf_edit": "_run_pdf_edit",
        "pdf_question": "_run_pdf_question",
        "user_spec": "_run_agent_draft",
        "pdf_review": "_run_pdf_review",
        "pdf_create": "_run_pdf_create",
    }[capability]
    setattr(agent, handler_name, handler)

    result = await agent._route_and_dispatch(request)

    assert result is handler.return_value
    handler.assert_awaited_once_with(request)


@pytest.mark.anyio
async def test_enum_router_returns_helpful_unsupported_message() -> None:
    agent = _agent()
    agent._router = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(output=_RouteDecision(capability="unsupported")))
    )

    result = await agent._route_and_dispatch(_request())

    assert result.model_dump()["message"] == "I can't help with that request."


@pytest.mark.anyio
async def test_delegate_helpers_forward_to_their_handlers() -> None:
    agent = _agent()
    request = _request()
    ctx = SimpleNamespace(deps=SimpleNamespace(request=request))
    for delegate, handler_name in (
        (agent.delegate_pdf_edit, "_run_pdf_edit"),
        (agent.delegate_pdf_question, "_run_pdf_question"),
        (agent.delegate_user_spec, "_run_agent_draft"),
        (agent.delegate_pdf_review, "_run_pdf_review"),
        (agent.delegate_pdf_create, "_run_pdf_create"),
    ):
        handler = AsyncMock(return_value=object())
        setattr(agent, handler_name, handler)
        assert await delegate(ctx) is handler.return_value
        handler.assert_awaited_once_with(request)


@pytest.mark.anyio
async def test_handle_uses_resume_and_model_router_paths() -> None:
    agent = _agent()
    request = _request()
    resumed = object()
    agent._resume = AsyncMock(return_value=resumed)
    request_with_resume = request.model_copy(update={"resume_with": SupportedCapability.PDF_EDIT})
    assert await agent.handle(request_with_resume) is resumed

    routed = object()
    agent._router = None
    agent.agent = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(output=routed)))
    assert await agent.handle(request) is routed


@pytest.mark.anyio
async def test_delegate_target_constructors_are_called(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = _agent()
    request = _request()

    class Delegate:
        def __init__(self, _runtime: object) -> None:
            self.orchestrate = AsyncMock(return_value=object())

    for name in ("PdfEditAgent", "PdfQuestionAgent", "UserSpecAgent", "PdfReviewAgent", "PdfCreateAgent"):
        monkeypatch.setattr(f"stirling.agents.orchestrator.{name}", Delegate)

    assert await agent._run_pdf_edit(request) is not None
    assert await agent._run_pdf_question(request) is not None
    assert await agent._run_agent_draft(request) is not None
    assert await agent._run_pdf_review(request) is not None
    assert await agent._run_pdf_create(request) is not None


@pytest.mark.anyio
async def test_unsupported_capability_preserves_input() -> None:
    agent = _agent()
    response = await agent.unsupported_capability(SimpleNamespace(), "custom", "not supported")

    assert response.capability == "custom"
    assert response.message == "not supported"
