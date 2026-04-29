"""Tests for ``stirling.agents.math_presentation``.

Only one helper lives in this module now: Verdict-artifact extraction
on the resume turn. Math intent itself is decided by the orchestrator's
top-level LLM and passed in as a flag, so there's no English regex to
test here. Verdict → prose / sticky-note text are the consumer agents'
responsibility — those projections are tested with each consumer.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.agents.math_presentation import extract_math_verdict
from stirling.contracts import (
    ExtractedFileText,
    ExtractedTextArtifact,
    MathAuditorToolReportArtifact,
    OrchestratorRequest,
    WorkflowArtifact,
)
from stirling.contracts.ledger import Discrepancy, DiscrepancyKind, Severity, Verdict


def _make_verdict(discrepancies: list[Discrepancy]) -> Verdict:
    return Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[d.page for d in discrepancies] or [0],
        rounds_taken=1,
        summary="Test verdict.",
        clean=not discrepancies,
    )


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
    artifact = MathAuditorToolReportArtifact(report=original)
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


def test_extract_math_verdict_ignores_other_artifact_kinds() -> None:
    """Only MathAuditorToolReportArtifact counts. Other artifact kinds (e.g.
    extracted page text from a NeedContent round-trip) must be ignored here so
    meta-agents don't misinterpret them as math reports."""
    unrelated = ExtractedTextArtifact(
        files=[ExtractedFileText(file_name="report.pdf", pages=[])],
    )
    request = _orchestrator_request_with_artifacts([unrelated])
    assert extract_math_verdict(request) is None


def test_malformed_math_auditor_report_is_rejected_at_validation_time() -> None:
    """The discriminated-union contract validates the report payload as a
    :class:`Verdict` on receipt — a corrupt body raises at construction time
    rather than silently surviving until the meta-agent tries to read it."""
    with pytest.raises(ValidationError):
        MathAuditorToolReportArtifact.model_validate(
            {
                "kind": "tool_report",
                "source_tool": "math_auditor_agent",
                "report": {"not_a_verdict_field": "garbage"},
            }
        )
