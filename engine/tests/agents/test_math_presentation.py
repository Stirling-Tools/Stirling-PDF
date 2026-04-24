"""Tests for ``stirling.agents.math_presentation``.

Focus is on the Verdict → CommentSpec projection — specifically that each spec
carries an ``anchor_text`` value so the ``/api/v1/misc/add-comments`` server can
place the sticky note at the line where the discrepancy was flagged instead of
the fixed right-margin fallback.
"""

from __future__ import annotations

from stirling.agents.math_presentation import (
    extract_math_verdict,
    is_math_intent,
    verdict_to_add_comments_payload,
    verdict_to_comment_specs,
    verdict_to_prose,
)
from stirling.contracts import OrchestratorRequest, ToolReportArtifact
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict
from stirling.models.tool_models import ToolEndpoint


def _make_verdict(discrepancies: list[Discrepancy]) -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[d.page for d in discrepancies] or [0],
        rounds_taken=1,
        summary="Test verdict.",
        clean=not discrepancies,
    )


def test_specs_prefer_stated_as_anchor_text() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Column total is wrong.",
                stated="$215,000",
                expected="$215,500",
                context="Total row",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert len(specs) == 1
    assert specs[0].anchor_text == "$215,000"


def test_specs_fall_back_to_context_when_stated_missing() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=1,
                kind=DiscrepancyKind.STATEMENT,
                severity=Severity.WARNING,
                description="Claim contradicts numbers.",
                stated="",
                expected="",
                context="We grew 15% this year",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert specs[0].anchor_text == "We grew 15% this year"


def test_specs_anchor_text_none_when_no_hints() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Column total is wrong.",
                stated="",
                expected="500",
                context="",
            )
        ]
    )

    specs = verdict_to_comment_specs(verdict)
    assert specs[0].anchor_text is None


def test_payload_serialises_anchor_text_as_camel_case() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=2,
                kind=DiscrepancyKind.ARITHMETIC,
                severity=Severity.ERROR,
                description="Off by ten.",
                stated="110",
                expected="100",
                context="Line 3",
            )
        ]
    )

    import json as _json

    payload = _json.loads(verdict_to_add_comments_payload(verdict))
    assert len(payload) == 1
    # Java deserialises via record-component names (camelCase), so the JSON
    # key must be ``anchorText`` not ``anchor_text``.
    assert payload[0]["anchorText"] == "110"
    assert payload[0]["pageIndex"] == 2


def test_is_math_intent_matches_math_keywords() -> None:
    assert is_math_intent("Is the math in this document correct?")
    assert is_math_intent("Please audit the invoice totals.")
    assert not is_math_intent("Summarise this document.")
    assert not is_math_intent("")


# ---------------------------------------------------------------------------
# Resume-turn round-trip — ToolReportArtifact → Verdict
# ---------------------------------------------------------------------------


def _orchestrator_request_with_artifacts(artifacts: list) -> OrchestratorRequest:
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
        source_tool=ToolEndpoint.MATH_AUDITOR_AGENT,
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
        source_tool=ToolEndpoint.PDF_COMMENT_AGENT,
        report={"annotationsApplied": 3, "rationale": "irrelevant"},
    )
    request = _orchestrator_request_with_artifacts([unrelated])
    assert extract_math_verdict(request) is None


def test_extract_math_verdict_degrades_gracefully_on_malformed_report() -> None:
    """A corrupt report JSON must not crash the orchestrator; the meta-agent will
    fall back to the non-math path."""
    malformed = ToolReportArtifact(
        source_tool=ToolEndpoint.MATH_AUDITOR_AGENT,
        report={"not_a_verdict_field": "garbage"},
    )
    request = _orchestrator_request_with_artifacts([malformed])
    assert extract_math_verdict(request) is None


# ---------------------------------------------------------------------------
# Prose rendering — pdf_question math path
# ---------------------------------------------------------------------------


def test_verdict_to_prose_announces_clean_verdict() -> None:
    verdict = Verdict(
        session_id="s1",
        discrepancies=[],
        pages_examined=[0, 1],
        rounds_taken=1,
        summary="All totals reconcile.",
        clean=True,
    )
    prose = verdict_to_prose(verdict)
    assert "No mathematical issues" in prose
    assert "2 page" in prose
    assert "All totals reconcile." in prose


def test_verdict_to_prose_lists_errors_and_warnings() -> None:
    verdict = _make_verdict(
        [
            Discrepancy(
                page=0,
                kind=DiscrepancyKind.TALLY,
                severity=Severity.ERROR,
                description="Subtotal wrong.",
                stated="110",
                expected="100",
                context="Line 3",
            ),
            Discrepancy(
                page=1,
                kind=DiscrepancyKind.STATEMENT,
                severity=Severity.WARNING,
                description="Growth claim unverified.",
                stated="",
                expected="",
                context="Paragraph 2",
            ),
        ]
    )
    prose = verdict_to_prose(verdict)
    assert "1 error" in prose
    assert "1 warning" in prose
    assert "Page 1" in prose and "Page 2" in prose  # 1-indexed pages
    assert "stated 110, expected 100" in prose
