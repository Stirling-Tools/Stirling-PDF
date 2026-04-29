"""Tests for ``PdfQuestionAgent.orchestrate`` — classifier-driven first-turn
routing and prompt pinning. The legacy text-grounded ``handle`` path is
covered separately in ``tests/test_pdf_question_agent.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.pdf_questions import _MATH_SYNTH_SYSTEM_PROMPT, PdfQuestionAgent
from stirling.contracts import (
    MathAuditorToolReportArtifact,
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    SupportedCapability,
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
async def test_orchestrate_classifier_true_embeds_plan_in_answer(runtime: AppRuntime) -> None:
    """First turn — classifier says math; the response is a PdfQuestionAnswerResponse
    with the math-auditor plan attached as a nullable ``edit_plan`` field. The
    answer is empty on this turn; the caller runs the embedded plan and resumes."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="ist die mathematik korrekt?",
        file_names=["report.pdf"],
    )

    with patch.object(agent._math_intent_classifier, "classify", AsyncMock(return_value=True)):
        response = await agent.orchestrate(request)

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == ""
    assert response.edit_plan is not None
    assert response.edit_plan.resume_with == SupportedCapability.PDF_QUESTION
    assert len(response.edit_plan.steps) == 1
    assert response.edit_plan.steps[0].tool == AgentToolId.MATH_AUDITOR_AGENT


@pytest.mark.anyio
async def test_orchestrate_resume_synthesises_answer_without_calling_classifier(
    runtime: AppRuntime,
) -> None:
    """Resume turn — Verdict in artifacts. The math-synth LLM is mocked; we
    verify the answer is plumbed through and that the classifier is short-
    circuited (no point asking 'is this math?' when we already have a Verdict)."""
    agent = PdfQuestionAgent(runtime)
    verdict = _make_verdict()
    request = OrchestratorRequest(
        user_message="ist die mathematik korrekt?",
        file_names=["report.pdf"],
        artifacts=[MathAuditorToolReportArtifact(report=verdict)],
    )
    canned_answer = "Die Summe stimmt nicht: angegeben $215,000, erwartet $215,500."
    classifier_mock = AsyncMock(return_value=False)
    with patch.object(agent._math_synth_agent, "run", return_value=_StubResult(output=canned_answer)):
        with patch.object(agent._math_intent_classifier, "classify", classifier_mock):
            response = await agent.orchestrate(request)

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == canned_answer
    classifier_mock.assert_not_called()


def test_math_synth_prompt_requires_verbatim_quoting() -> None:
    """If this prompt is rephrased and drops the verbatim rule, the LLM may
    paraphrase numeric values from the Verdict."""
    assert "verbatim" in _MATH_SYNTH_SYSTEM_PROMPT.lower()
