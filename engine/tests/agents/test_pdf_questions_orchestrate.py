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
    AiFile,
    EditPlanResponse,
    MathAuditorToolReportArtifact,
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    SupportedCapability,
)
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict
from stirling.models import FileId, PrincipalId, UserId
from stirling.models.agent_tool_models import AgentToolId
from stirling.services.runtime import AppRuntime
from stirling.services.tracking import current_user_id


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
async def test_orchestrate_classifier_true_returns_math_audit_plan(runtime: AppRuntime) -> None:
    """First turn — classifier says math; the response is an EditPlanResponse
    (``outcome=PLAN``) with ``resume_with=PDF_QUESTION``. The caller runs the
    plan and re-invokes the orchestrator with the verdict in artifacts."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="ist die mathematik korrekt?",
        files=[AiFile(id=FileId("report-id"), name="report.pdf")],
    )

    with patch.object(agent._math_intent_classifier, "classify", AsyncMock(return_value=True)):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with == SupportedCapability.PDF_QUESTION
    assert len(response.steps) == 1
    assert response.steps[0].tool == AgentToolId.MATH_AUDITOR_AGENT


def test_principals_require_a_user_id_when_files_are_attached(runtime: AppRuntime) -> None:
    """Anything touching per-user document storage must still fail closed."""
    token = current_user_id.set(None)
    try:
        with pytest.raises(RuntimeError, match="X-User-Id"):
            PdfQuestionAgent._principals_for([AiFile(id=FileId("f1"), name="a.pdf")])
    finally:
        current_user_id.reset(token)


def test_principals_tolerate_a_missing_user_id_when_no_files_are_attached(runtime: AppRuntime) -> None:
    """The whole reason a login-disabled self-host can ask a product question. Java sends no
    X-User-Id when security is off, and a file-less turn touches no per-user storage - an empty
    principal set is fail-closed in the store, so nothing is widened by tolerating it."""
    token = current_user_id.set(None)
    try:
        assert PdfQuestionAgent._principals_for([]) == []
    finally:
        current_user_id.reset(token)


def test_principals_still_use_the_user_id_when_one_is_present(runtime: AppRuntime) -> None:
    token = current_user_id.set(UserId("bob"))
    try:
        assert PdfQuestionAgent._principals_for([]) == [PrincipalId("bob")]
    finally:
        current_user_id.reset(token)


@pytest.mark.anyio
async def test_orchestrate_never_plans_a_math_audit_without_a_file(runtime: AppRuntime) -> None:
    """The math specialist audits figures in an attached document, and the classifier only
    sees the message text. Product questions now route here with no file, so a numeric-
    sounding one ("how does it calculate the compression percentage?") would otherwise plan
    a math-auditor step with no input - which the Java tool rejects outright."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(user_message="how does Stirling calculate the compression percentage?")

    classifier = AsyncMock(return_value=True)
    with patch.object(agent._math_intent_classifier, "classify", classifier):
        with patch.object(agent, "handle", AsyncMock(return_value="handled")) as handle:
            response = await agent.orchestrate(request)

    assert response == "handled"
    handle.assert_awaited_once()
    classifier.assert_not_awaited()


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
        files=[AiFile(id=FileId("report-id"), name="report.pdf")],
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
