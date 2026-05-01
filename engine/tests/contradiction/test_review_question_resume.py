"""
Resume-turn integration tests — PdfReviewAgent and PdfQuestionAgent for
contradiction-flavoured prompts.

Verifies the first-turn plan emission, the resume-turn projection of a
``ContradictionVerdict`` into ``ADD_COMMENTS`` specs (review) or
synthesised prose (question), and the v1 precedence rule (contradiction
wins over math when both intent classifiers fire).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.pdf_review import (
    PdfReviewAgent,
    _PairedLocalisedContradiction,
    _PairedLocalisedVerdict,
)
from stirling.contracts import (
    AiFile,
    ContradictionToolReportArtifact,
    EditPlanResponse,
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    SupportedCapability,
)
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionSeverity,
    ContradictionVerdict,
)
from stirling.models import FileId, ToolEndpoint
from stirling.models.agent_tool_models import AgentToolId
from stirling.services.runtime import AppRuntime


def _ai_file(name: str = "report.pdf") -> AiFile:
    return AiFile(id=FileId(f"{name}-id"), name=name)


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


@dataclass
class _StubResult:
    output: Any


def _claim(page: int, polarity: str, quote: str) -> Claim:
    return Claim(
        page=page,
        subject="project deadline",
        polarity=polarity,  # type: ignore[arg-type]
        text=f"Page {page + 1} {polarity} the project deadline.",
        quote=quote,
    )


def _contradiction(page1: int, page2: int, quote1: str, quote2: str) -> Contradiction:
    return Contradiction(
        subject="project deadline",
        claim1=_claim(page1, "assert", quote1),
        claim2=_claim(page2, "deny", quote2),
        explanation="page-1 asserts, page-2 denies",
        severity=ContradictionSeverity.ERROR,
    )


def _verdict(contradictions: list[Contradiction]) -> ContradictionVerdict:
    return ContradictionVerdict(
        session_id="s",
        contradictions=contradictions,
        pages_examined=[c.page1 for c in contradictions]
        + [c.page2 for c in contradictions]
        or [0],
        rounds_taken=2,
        summary=f"{len(contradictions)} contradiction(s).",
        clean=not contradictions,
    )


# ---------------------------------------------------------------------------
# PdfReviewAgent.orchestrate — first turn (contradiction-flavoured prompt)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_review_first_turn_contradiction_emits_plan(runtime: AppRuntime) -> None:
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="are there any contradictions in this report?",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=False),
    ):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with == SupportedCapability.PDF_REVIEW
    assert len(response.steps) == 1
    assert response.steps[0].tool == AgentToolId.CONTRADICTION_AGENT


# ---------------------------------------------------------------------------
# PdfReviewAgent.orchestrate — resume turn (one contradiction → 2 specs)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_review_resume_one_contradiction_emits_two_paired_specs(
    runtime: AppRuntime,
) -> None:
    """One contradiction → two CommentSpecs (one anchor per page)."""
    agent = PdfReviewAgent(runtime)
    contradiction = _contradiction(0, 2, "deadline is Friday", "deadline is next month")
    verdict = _verdict([contradiction])
    request = OrchestratorRequest(
        user_message="flag contradictions",
        files=[_ai_file()],
        artifacts=[ContradictionToolReportArtifact(report=verdict)],
    )

    canned = _PairedLocalisedVerdict(
        pairs=[
            _PairedLocalisedContradiction(
                contradiction_index=0,
                subject="Project deadline conflict",
                body_for_page1="Conflicts with page 3 (sees next month).",
                body_for_page2="Conflicts with page 1 (sees Friday).",
            )
        ]
    )

    with patch.object(
        agent._contradiction_localiser_agent,
        "run",
        return_value=_StubResult(output=canned),
    ):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == ToolEndpoint.ADD_COMMENTS

    comments_payload = json.loads(step.parameters.comments)
    assert len(comments_payload) == 2

    # One spec per anchor page; anchor_text matches the claim quote.
    by_page = {entry["pageIndex"]: entry for entry in comments_payload}
    assert set(by_page) == {0, 2}
    assert by_page[0]["anchorText"] == "deadline is Friday"
    assert by_page[2]["anchorText"] == "deadline is next month"


# ---------------------------------------------------------------------------
# PdfReviewAgent.orchestrate — resume turn (two contradictions → 4 specs)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_review_resume_two_contradictions_emits_four_specs(
    runtime: AppRuntime,
) -> None:
    agent = PdfReviewAgent(runtime)
    c1 = _contradiction(0, 1, "deadline is Friday", "deadline is next month")
    c2 = _contradiction(2, 3, "approve recommendation", "reject recommendation")
    verdict = _verdict([c1, c2])
    request = OrchestratorRequest(
        user_message="flag contradictions",
        files=[_ai_file()],
        artifacts=[ContradictionToolReportArtifact(report=verdict)],
    )

    canned = _PairedLocalisedVerdict(
        pairs=[
            _PairedLocalisedContradiction(
                contradiction_index=0,
                subject="deadline conflict",
                body_for_page1="See page 2 for the rescheduled date.",
                body_for_page2="See page 1 for the original deadline.",
            ),
            _PairedLocalisedContradiction(
                contradiction_index=1,
                subject="recommendation conflict",
                body_for_page1="Page 4 rejects this recommendation.",
                body_for_page2="Page 3 approves this recommendation.",
            ),
        ]
    )

    with patch.object(
        agent._contradiction_localiser_agent,
        "run",
        return_value=_StubResult(output=canned),
    ):
        response = await agent.orchestrate(request)

    comments_payload = json.loads(response.steps[0].parameters.comments)
    assert len(comments_payload) == 4
    pages = sorted(entry["pageIndex"] for entry in comments_payload)
    assert pages == [0, 1, 2, 3]


# ---------------------------------------------------------------------------
# PdfQuestionAgent.orchestrate — first turn (contradiction-flavoured prompt)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_question_first_turn_contradiction_emits_plan(
    runtime: AppRuntime,
) -> None:
    """First turn returns an :class:`EditPlanResponse` directly (not a
    PdfQuestionAnswerResponse with an embedded plan) — mirroring the math
    branch's shape on main."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="does this report contradict itself?",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=False),
    ):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with == SupportedCapability.PDF_QUESTION
    assert len(response.steps) == 1
    assert response.steps[0].tool == AgentToolId.CONTRADICTION_AGENT


# ---------------------------------------------------------------------------
# PdfQuestionAgent.orchestrate — resume turn (synthesised answer)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_question_resume_synthesises_answer_from_verdict(
    runtime: AppRuntime,
) -> None:
    agent = PdfQuestionAgent(runtime)
    verdict = _verdict([_contradiction(0, 2, "Friday", "next month")])
    request = OrchestratorRequest(
        user_message="does this report contradict itself?",
        files=[_ai_file()],
        artifacts=[ContradictionToolReportArtifact(report=verdict)],
    )

    canned_answer = (
        "Yes — page 1 says 'Friday' but page 3 says 'next month'."
    )
    classifier_mock = AsyncMock(return_value=False)
    with patch.object(
        agent._contradiction_synth_agent,
        "run",
        return_value=_StubResult(output=canned_answer),
    ), patch.object(
        agent._contradiction_intent_classifier, "classify", classifier_mock
    ), patch.object(agent._math_intent_classifier, "classify", classifier_mock):
        response = await agent.orchestrate(request)

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == canned_answer
    # Resume-turn short-circuit — neither classifier should be consulted.
    classifier_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Math regression — math-only prompt routes to math agent
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_review_math_only_prompt_still_routes_to_math_agent(
    runtime: AppRuntime,
) -> None:
    """Spot-check: the new contradiction branch must not steal math prompts."""
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="check the totals add up correctly",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=False),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.steps[0].tool == AgentToolId.MATH_AUDITOR_AGENT


# Precedence tests for the both-classifiers-true case live in
# test_combined_intent.py — they document the v1 limitation that math
# intent is silently dropped when contradiction intent is also true.
