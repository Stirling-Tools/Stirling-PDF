"""Tests for ``stirling.agents.math_presentation``.

Only language-agnostic helpers live in this module now: intent detection
and Verdict-artifact extraction. Verdict → prose / sticky-note text are
the consumer agents' responsibility (they speak the user's language via
their own LLM calls), so those projections are tested with each consumer.
"""

from __future__ import annotations

from stirling.agents.math_presentation import extract_math_verdict, is_math_intent
from stirling.contracts import OrchestratorRequest, ToolReportArtifact, WorkflowArtifact
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict
from stirling.models.agent_tool_models import AgentToolId


def _make_verdict(discrepancies: list[Discrepancy]) -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[d.page for d in discrepancies] or [0],
        rounds_taken=1,
        summary="Test verdict.",
        clean=not discrepancies,
    )


def test_is_math_intent_matches_math_keywords() -> None:
    assert is_math_intent("Is the math in this document correct?")
    assert is_math_intent("Please audit the invoice totals.")
    assert not is_math_intent("Summarise this document.")
    assert not is_math_intent("")


# ---------------------------------------------------------------------------
# Resume-turn round-trip — ToolReportArtifact → Verdict
# ---------------------------------------------------------------------------


def _orchestrator_request_with_artifacts(artifacts: list[WorkflowArtifact]) -> OrchestratorRequest:
    return OrchestratorRequest(
        user_message="review the math",
        file_names=["report.pdf"],
        artifacts=artifacts,
    )


def test_extract_math_verdict_roundtrips_a_math_auditor_report() -> None:
    """When the math auditor has already run, Java re-enters the orchestrator with
    a ToolReportArtifact carrying the serialised Verdict; the meta-agent's first
    job on the resume turn is to hydrate that back into a Verdict."""
    original = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Total mismatch.",
                stated="$215,000",
                expected="$215,500",
                context="Revenue row",
            )
        ]
    )
    artifact = ToolReportArtifact(
        source_tool=AgentToolId.MATH_AUDITOR_AGENT,
        report=original.model_dump(mode="json"),
    )
    request = _orchestrator_request_with_artifacts([artifact])

    verdict = extract_math_verdict(request)

    assert verdict is not None
    assert len(verdict.discrepancies) == 1
    assert verdict.discrepancies[0].stated == "$215,000"
    assert verdict.discrepancies[0].expected == "$215,500"


def test_extract_math_verdict_returns_none_when_no_artifacts_present() -> None:
    """First turn — the plan has not yet run, so artifacts is empty."""
    request = _orchestrator_request_with_artifacts([])
    assert extract_math_verdict(request) is None


def test_extract_math_verdict_ignores_artifacts_from_other_tools() -> None:
    """Only reports from the math-auditor count; reports from other specialists
    should be ignored here so meta-agents don't misinterpret them."""
    unrelated = ToolReportArtifact(
        source_tool=AgentToolId.PDF_COMMENT_AGENT,
        report={"annotationsApplied": 3, "rationale": "irrelevant"},
    )
    request = _orchestrator_request_with_artifacts([unrelated])
    assert extract_math_verdict(request) is None


def test_extract_math_verdict_degrades_gracefully_on_malformed_report() -> None:
    """A corrupt report JSON must not crash the orchestrator; the meta-agent will
    fall back to the non-math path."""
    malformed = ToolReportArtifact(
        source_tool=AgentToolId.MATH_AUDITOR_AGENT,
        report={"not_a_verdict_field": "garbage"},
    )
    request = _orchestrator_request_with_artifacts([malformed])
    assert extract_math_verdict(request) is None
