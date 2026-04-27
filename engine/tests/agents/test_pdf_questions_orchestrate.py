"""Tests for ``PdfQuestionAgent.orchestrate`` — flag-driven first-turn
routing and prompt pinning. The legacy text-grounded ``handle`` path is
covered separately in ``tests/test_pdf_question_agent.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import patch

import pytest

from stirling.agents.pdf_questions import _MATH_SYNTH_SYSTEM_PROMPT, PdfQuestionAgent
from stirling.contracts import (
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    SupportedCapability,
    ToolReportArtifact,
)
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict
from stirling.models.agent_tool_models import AgentToolId
from stirling.services.runtime import AppRuntime


@dataclass
class _StubResult:
    output: str


def _make_verdict() -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=[
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Total mismatch.",
                stated="$215,000",
                expected="$215,500",
                context="Revenue row",
            )
        ],
        pages_examined=[0],
        rounds_taken=1,
        summary="One discrepancy.",
        clean=False,
    )


@pytest.mark.anyio
async def test_orchestrate_consult_math_embeds_plan_in_answer(runtime: AppRuntime) -> None:
    """First turn with consult_math_auditor=True and no Verdict artifact should
    return a PdfQuestionAnswerResponse with the math-auditor plan attached as a
    nullable ``edit_plan`` field. The answer field is empty on this turn — the
    caller runs the embedded plan and resumes the orchestrator."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="ist die mathematik korrekt?",
        file_names=["report.pdf"],
    )

    response = await agent.orchestrate(request, consult_math_auditor=True)

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == ""
    assert response.edit_plan is not None
    assert response.edit_plan.resume_with == SupportedCapability.PDF_QUESTION
    assert len(response.edit_plan.steps) == 1
    assert response.edit_plan.steps[0].tool == AgentToolId.MATH_AUDITOR_AGENT


@pytest.mark.anyio
async def test_orchestrate_resume_synthesises_answer_in_users_language(runtime: AppRuntime) -> None:
    """Resume turn — Verdict in artifacts. The math-synth LLM is mocked; we
    verify the answer is plumbed through to PdfQuestionAnswerResponse."""
    agent = PdfQuestionAgent(runtime)
    verdict = _make_verdict()
    request = OrchestratorRequest(
        user_message="ist die mathematik korrekt?",
        file_names=["report.pdf"],
        artifacts=[
            ToolReportArtifact(
                source_tool=AgentToolId.MATH_AUDITOR_AGENT,
                report=verdict.model_dump(mode="json"),
            )
        ],
    )
    canned_answer = "Die Summe stimmt nicht: angegeben $215,000, erwartet $215,500."
    with patch.object(agent._math_synth_agent, "run", return_value=_StubResult(output=canned_answer)):
        response = await agent.orchestrate(request, consult_math_auditor=False)

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == canned_answer


def test_math_synth_prompt_requires_verbatim_quoting() -> None:
    """If this prompt is rephrased and drops the verbatim rule, the LLM may
    paraphrase numeric values from the Verdict."""
    assert "verbatim" in _MATH_SYNTH_SYSTEM_PROMPT.lower()
