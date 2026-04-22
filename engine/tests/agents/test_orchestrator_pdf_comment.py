"""
Orchestrator ``delegate_pdf_comment`` contract test.

The real orchestrator delegates to the PDF Comment Agent via a pydantic-ai
tool output. Exercising the full ``agent.run(...)`` call would hit the LLM
and requires building a real ``RunContext`` — so instead this test invokes
``delegate_pdf_comment`` directly with a minimal ``deps`` stand-in. That's
enough to verify the wire contract the orchestrator produces:

* it returns an ``EditPlanResponse``;
* with exactly one step;
* whose ``tool`` is ``AgentToolId.PDF_COMMENT_AGENT``;
* whose ``parameters.prompt`` echoes the user's request.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

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
async def test_delegate_pdf_comment_wires_prompt_to_tool_step(runtime: AppRuntime) -> None:
    orchestrator = OrchestratorAgent(runtime)
    request = OrchestratorRequest(
        user_message="please add review comments flagging ambiguous dates",
        file_names=["contract.pdf"],
    )
    ctx = SimpleNamespace(deps=_FakeDeps(request=request))

    response = await orchestrator.delegate_pdf_comment(ctx)  # type: ignore[arg-type]

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == AgentToolId.PDF_COMMENT_AGENT
    assert isinstance(step.parameters, PdfCommentAgentParams)
    assert step.parameters.prompt == request.user_message
