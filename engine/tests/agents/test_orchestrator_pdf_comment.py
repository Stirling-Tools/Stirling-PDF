"""
Orchestrator ``delegate_pdf_review`` contract test.

The real orchestrator delegates PDF-review requests via a pydantic-ai tool
output. Exercising the full ``agent.run(...)`` call would hit the LLM and
requires building a real ``RunContext`` — so instead this test invokes
``delegate_pdf_review`` directly with a minimal ``deps`` stand-in. That's
enough to verify the wire contract the orchestrator produces:

* it returns an ``EditPlanResponse``;
* with exactly one step;
* whose ``tool`` is ``AgentToolId.PDF_COMMENT_AGENT`` (the composed AI tool
  under ``/api/v1/ai/tools/pdf-comment-agent``);
* whose ``parameters.prompt`` echoes the user's request.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents import OrchestratorAgent
from stirling.contracts import OrchestratorRequest
from stirling.contracts.pdf_edit import EditPlanResponse
from stirling.models.agent_tool_models import AgentToolId, PdfCommentAgentParams
from stirling.services.runtime import AppRuntime


@dataclass(frozen=True)
class _FakeDeps:
    request: OrchestratorRequest


@pytest.mark.anyio
async def test_delegate_pdf_review_wires_prompt_to_tool_step(runtime: AppRuntime) -> None:
    orchestrator = OrchestratorAgent(runtime)
    request = OrchestratorRequest(
        user_message="please add review comments flagging ambiguous dates",
        file_names=["contract.pdf"],
    )
    ctx = SimpleNamespace(deps=_FakeDeps(request=request))

    # PdfReviewAgent now classifies math intent locally via a tiny LLM. Stub it
    # to false so this test stays focused on the prose-review wire contract.
    with patch(
        "stirling.agents.pdf_review.MathIntentClassifier.classify",
        new=AsyncMock(return_value=False),
    ):
        response = await orchestrator.delegate_pdf_review(ctx)  # type: ignore[arg-type]

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == AgentToolId.PDF_COMMENT_AGENT
    assert step.tool.value == "/api/v1/ai/tools/pdf-comment-agent"
    assert isinstance(step.parameters, PdfCommentAgentParams)
    assert step.parameters.prompt == request.user_message
