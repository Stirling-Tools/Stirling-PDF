"""
PDF-review delegate contract test.

The orchestrator routes PDF-review requests to ``PdfReviewAgent.orchestrate``
(the orchestrator merely selects the delegate; the review logic lives on the
agent). Exercising the agent directly avoids the LLM routing call and verifies
the wire contract the delegate produces for a plain prose-review request:

* it returns an ``EditPlanResponse``;
* with exactly one step;
* whose ``tool`` is ``AgentToolId.PDF_COMMENT_AGENT`` (the composed AI tool
  under ``/api/v1/ai/tools/pdf-comment-agent``);
* whose ``parameters.prompt`` echoes the user's request.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents import PdfReviewAgent
from stirling.contracts import AiFile, OrchestratorRequest
from stirling.contracts.pdf_edit import EditPlanResponse
from stirling.models import FileId
from stirling.models.agent_tool_models import AgentToolId, PdfCommentAgentParams
from stirling.services.runtime import AppRuntime


@pytest.mark.anyio
async def test_pdf_review_wires_prompt_to_tool_step(runtime: AppRuntime) -> None:
    review_agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="please add review comments flagging ambiguous dates",
        files=[AiFile(id=FileId("contract-id"), name="contract.pdf")],
    )

    # PdfReviewAgent classifies math and contradiction intent locally via tiny
    # LLMs. Stub both to false so this test stays focused on the prose-review
    # wire contract.
    with (
        patch(
            "stirling.agents.pdf_review.MathIntentClassifier.classify",
            new=AsyncMock(return_value=False),
        ),
        patch(
            "stirling.agents.pdf_review.ContradictionIntentClassifier.classify",
            new=AsyncMock(return_value=False),
        ),
    ):
        response = await review_agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == AgentToolId.PDF_COMMENT_AGENT
    assert step.tool.value == "/api/v1/ai/tools/pdf-comment-agent"
    assert isinstance(step.parameters, PdfCommentAgentParams)
    assert step.parameters.prompt == request.user_message
