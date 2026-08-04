from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from stirling.agents.pdf_edit import (
    PdfEditAgent,
    PdfEditNeedContentSelection,
    PdfEditParameterSelector,
    PdfEditSelectionAgent,
)
from stirling.contracts import AiFile, OrchestratorRequest, PdfEditRequest
from stirling.models import FileId, ToolEndpoint
from stirling.services.runtime import AppRuntime

# These tests replace pydantic-ai agents with small async fakes.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


def test_pdf_edit_parameter_prompt_and_selection_instructions() -> None:
    selector = object.__new__(PdfEditParameterSelector)
    request = PdfEditRequest(user_message="convert this", files=[AiFile(id=FileId("id"), name="a.pdf")])
    prompt = selector._build_parameter_prompt(request, [ToolEndpoint.PDF_TO_TEXT], 0, [])
    assert "convert this" in prompt
    assert "PDF_TO_TEXT" in selector._get_operation_instructions(ToolEndpoint.PDF_TO_TEXT)


@pytest.mark.anyio
async def test_pdf_edit_selection_and_parameter_agents_forward_model_output() -> None:
    selection = object.__new__(PdfEditSelectionAgent)
    selection.agent = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(output="selection")))
    assert await selection.select("prompt") == "selection"

    parameter = object.__new__(PdfEditParameterSelector)
    parameter.agent = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(output="parameters")))
    request = PdfEditRequest(user_message="convert")
    assert await parameter.select(request, [ToolEndpoint.PDF_TO_TEXT], 0, []) == "parameters"


def test_pdf_edit_agent_builds_selection_and_need_content_responses(runtime: AppRuntime) -> None:
    agent = object.__new__(PdfEditAgent)
    agent.runtime = runtime
    request = PdfEditRequest(
        user_message="inspect",
        files=[AiFile(id=FileId("id"), name="a.pdf")],
    )
    selection = PdfEditNeedContentSelection(reason="need text", file_names=["a.pdf"], max_pages=2)
    response = agent._build_need_content_response(selection, request)
    assert response.files[0].file.name == "a.pdf"
    assert (
        agent._build_need_content_response(PdfEditNeedContentSelection(reason="all"), request).files[0].file.name
        == "a.pdf"
    )
    assert (
        agent._build_need_content_response(
            PdfEditNeedContentSelection(reason="fallback", file_names=["missing.pdf"]), request
        )
        .files[0]
        .file.name
        == "a.pdf"
    )

    selection_agent = agent._build_selection_agent(
        [ToolEndpoint.PDF_TO_TEXT], [ToolEndpoint.MERGE_PDFS], allow_need_content=True
    )
    assert isinstance(selection_agent, PdfEditSelectionAgent)


@pytest.mark.anyio
async def test_pdf_edit_orchestrate_adapts_request() -> None:
    agent = object.__new__(PdfEditAgent)
    expected = object()
    agent.handle = AsyncMock(return_value=expected)
    request = OrchestratorRequest(user_message="convert", files=[AiFile(id=FileId("id"), name="a.pdf")])

    assert await agent.orchestrate(request) is expected
    agent.handle.assert_awaited_once()
