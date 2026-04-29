"""Tests for ``PdfReviewAgent``.

LLM-localised text is the consumer's responsibility (verified by mocking
the localiser agent), but the deterministic placement geometry —
anchor-text selection, per-page stacking, fallback right-margin — is pure
Python and worth pinning here.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.pdf_review import (
    _LOCALISER_SYSTEM_PROMPT,
    PdfReviewAgent,
    _LocalisedComment,
    _LocalisedVerdict,
)
from stirling.contracts import EditPlanResponse, OrchestratorRequest, SupportedCapability
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict
from stirling.models import ToolEndpoint
from stirling.models.agent_tool_models import AgentToolId, PdfCommentAgentParams
from stirling.services.runtime import AppRuntime


@dataclass
class _StubResult:
    output: _LocalisedVerdict


def _make_verdict(discrepancies: list[Discrepancy]) -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[d.page for d in discrepancies] or [0],
        rounds_taken=1,
        summary="Test verdict.",
        clean=not discrepancies,
    )


def _discrepancy(page: int = 0, stated: str = "$215,000", context: str = "Total row") -> Discrepancy:
    return Discrepancy(
        page=page,
        kind=DiscrepancyKind.TALLY,
        severity=Severity.ERROR,
        description="Column total is wrong.",
        stated=stated,
        expected="$215,500",
        context=context,
    )


def test_specs_prefer_stated_as_anchor_text() -> None:
    verdict = _make_verdict([_discrepancy(stated="$215,000")])
    localised = [_LocalisedComment(discrepancy_index=0, subject="Total mismatch", text="Off by $500.")]
    specs = PdfReviewAgent._build_comment_specs(verdict, localised)
    assert len(specs) == 1
    assert specs[0].anchor_text == "$215,000"


def test_specs_fall_back_to_context_when_stated_missing() -> None:
    verdict = _make_verdict(
        [
            _discrepancy(stated="", context="We grew 15% this year"),
        ]
    )
    localised = [_LocalisedComment(discrepancy_index=0, subject="Claim", text="Unverified.")]
    specs = PdfReviewAgent._build_comment_specs(verdict, localised)
    assert specs[0].anchor_text == "We grew 15% this year"


def test_specs_anchor_text_none_when_no_hints() -> None:
    verdict = _make_verdict([_discrepancy(stated="", context="")])
    localised = [_LocalisedComment(discrepancy_index=0, subject="Total wrong", text="Off by ten.")]
    specs = PdfReviewAgent._build_comment_specs(verdict, localised)
    assert specs[0].anchor_text is None


def test_specs_drop_out_of_range_indices() -> None:
    verdict = _make_verdict([_discrepancy(page=0)])  # only one discrepancy, valid index is 0
    localised = [
        _LocalisedComment(discrepancy_index=0, subject="Real", text="Real comment."),
        _LocalisedComment(discrepancy_index=99, subject="Hallucinated", text="Should be dropped."),
    ]
    specs = PdfReviewAgent._build_comment_specs(verdict, localised)
    assert len(specs) == 1
    assert specs[0].text == "Real comment."


def test_specs_stack_per_page() -> None:
    """Multiple discrepancies on the same page should be vertically stacked
    in the right margin (decreasing y) rather than overlapping."""
    verdict = _make_verdict(
        [
            _discrepancy(page=0, stated="A"),
            _discrepancy(page=0, stated="B"),
            _discrepancy(page=1, stated="C"),
        ]
    )
    localised = [
        _LocalisedComment(discrepancy_index=0, subject="s", text="t"),
        _LocalisedComment(discrepancy_index=1, subject="s", text="t"),
        _LocalisedComment(discrepancy_index=2, subject="s", text="t"),
    ]
    specs = PdfReviewAgent._build_comment_specs(verdict, localised)
    page0 = [s for s in specs if s.page_index == 0]
    assert len(page0) == 2
    assert page0[0].y > page0[1].y  # stacked downward
    page1 = [s for s in specs if s.page_index == 1]
    assert page1[0].y == page0[0].y  # first on a new page resets the stack


@pytest.mark.anyio
async def test_payload_serialises_anchor_text_as_camel_case(runtime: AppRuntime) -> None:
    """Java deserialises the comments JSON via record-component names, so the
    keys must be camelCase (anchorText, pageIndex)."""
    agent = PdfReviewAgent(runtime)
    verdict = _make_verdict([_discrepancy(page=2, stated="110", context="Line 3")])
    canned = _LocalisedVerdict(
        comments=[_LocalisedComment(discrepancy_index=0, subject="Off by ten", text="Subtotal wrong.")],
    )
    with patch.object(agent._localiser_agent, "run", return_value=_StubResult(output=canned)):
        payload_json = await agent._build_localised_comments_payload("flag math errors", verdict)

    payload = json.loads(payload_json)
    assert len(payload) == 1
    assert payload[0]["anchorText"] == "110"
    assert payload[0]["pageIndex"] == 2
    assert payload[0]["text"] == "Subtotal wrong."


# ---------------------------------------------------------------------------
# orchestrate() — classifier-driven first-turn routing
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_orchestrate_classifier_true_emits_math_audit_plan(runtime: AppRuntime) -> None:
    """First turn — when the math-intent classifier says yes, emit a one-step plan
    calling the math auditor with resume_with=PDF_REVIEW."""
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(user_message="vérifie les totaux", file_names=["report.pdf"])

    with patch.object(agent._math_intent_classifier, "classify", AsyncMock(return_value=True)):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with == SupportedCapability.PDF_REVIEW
    assert len(response.steps) == 1
    assert response.steps[0].tool == AgentToolId.MATH_AUDITOR_AGENT


@pytest.mark.anyio
async def test_orchestrate_classifier_false_routes_to_pdf_comment_agent(runtime: AppRuntime) -> None:
    """When the classifier says no math, delegate to pdf-comment-agent for prose review."""
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="review the invoices for ambiguous wording",
        file_names=["contract.pdf"],
    )

    with patch.object(agent._math_intent_classifier, "classify", AsyncMock(return_value=False)):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with is None
    assert len(response.steps) == 1
    assert response.steps[0].tool == AgentToolId.PDF_COMMENT_AGENT
    assert isinstance(response.steps[0].parameters, PdfCommentAgentParams)
    assert response.steps[0].parameters.prompt == request.user_message


@pytest.mark.anyio
async def test_orchestrate_resume_uses_verdict_without_calling_classifier(
    runtime: AppRuntime,
) -> None:
    """Resume turns are detected by Verdict-artifact presence and bypass the
    classifier entirely (saves an LLM call when we already know the answer)."""
    from stirling.contracts import MathAuditorToolReportArtifact

    agent = PdfReviewAgent(runtime)
    verdict = _make_verdict([_discrepancy(page=0, stated="$100")])
    request = OrchestratorRequest(
        user_message="flag math errors",
        file_names=["report.pdf"],
        artifacts=[MathAuditorToolReportArtifact(report=verdict)],
    )
    canned = _LocalisedVerdict(
        comments=[_LocalisedComment(discrepancy_index=0, subject="Wrong", text="Off.")],
    )
    classifier_mock = AsyncMock(return_value=False)
    with patch.object(agent._localiser_agent, "run", return_value=_StubResult(output=canned)):
        with patch.object(agent._math_intent_classifier, "classify", classifier_mock):
            response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)
    assert response.resume_with is None
    assert len(response.steps) == 1
    assert response.steps[0].tool == ToolEndpoint.ADD_COMMENTS
    classifier_mock.assert_not_called()  # short-circuit on Verdict


# ---------------------------------------------------------------------------
# Prompt pinning — guard against accidental drift
# ---------------------------------------------------------------------------


def test_localiser_prompt_requires_verbatim_quoting() -> None:
    """If this prompt is rephrased and drops the verbatim rule, the LLM may
    paraphrase numeric values like ``$215,000`` as 'about $215k'."""
    assert "verbatim" in _LOCALISER_SYSTEM_PROMPT.lower()
