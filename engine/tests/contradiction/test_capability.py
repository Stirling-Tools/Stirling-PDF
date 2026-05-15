"""ContradictionCapability — tool dispatch, budget gate, and formatted output."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from stirling.agents.contradiction import ContradictionCapability, ContradictionDetector
from stirling.contracts import AiFile
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionReport,
    ContradictionSeverity,
)
from stirling.models import FileId
from stirling.services.runtime import AppRuntime


def _file(file_id: str, name: str) -> AiFile:
    return AiFile(id=FileId(file_id), name=name)


def _claim(page: int, quote: str, *, subject: str = "deadline") -> Claim:
    return Claim(
        page=page,
        subject=subject,
        polarity="assert",
        text=f"paraphrase on page {page}",
        quote=quote,
    )


def _canned_report() -> ContradictionReport:
    return ContradictionReport(
        contradictions=[
            Contradiction(
                subject="deadline",
                claim1=_claim(1, "The deadline is March 5."),
                claim2=_claim(5, "The deadline is April 10."),
                explanation="The two pages state different deadlines.",
                severity=ContradictionSeverity.ERROR,
            )
        ],
        pages_examined=[1, 5],
        clean=False,
        summary="Examined 2 pages; found 1 contradiction.",
    )


@pytest.mark.anyio
async def test_find_contradictions_returns_formatted_text(runtime: AppRuntime) -> None:
    detector = ContradictionDetector(runtime)
    canned = _canned_report()
    detector.detect = AsyncMock(return_value=canned)  # type: ignore[method-assign]

    capability = ContradictionCapability(detector=detector, files=[_file("doc-a", "a.pdf")])
    result = await capability._find_contradictions("are there inconsistent deadlines?")

    detector.detect.assert_awaited_once()
    # Page numbers and verbatim quotes should be present in the rendered output.
    assert "1" in result and "5" in result
    assert "The deadline is March 5." in result
    assert "The deadline is April 10." in result
    assert canned.summary in result


@pytest.mark.anyio
async def test_budget_gate_hides_tool_after_first_audit(runtime: AppRuntime) -> None:
    """The prepare callback returns None once ``max_audits`` is reached."""
    detector = ContradictionDetector(runtime)
    detector.detect = AsyncMock(return_value=_canned_report())  # type: ignore[method-assign]

    capability = ContradictionCapability(
        detector=detector,
        files=[_file("doc-a", "a.pdf")],
        max_audits=1,
    )
    sentinel: object = object()

    # Budget intact → prepare returns the tool definition.
    assert await capability._prepare_find_contradictions(None, sentinel) is sentinel  # type: ignore[arg-type]

    # Spend the budget.
    await capability._find_contradictions("anything")

    # Budget spent → prepare returns None.
    assert await capability._prepare_find_contradictions(None, sentinel) is None  # type: ignore[arg-type]


@pytest.mark.anyio
async def test_find_contradictions_with_no_files_returns_message(runtime: AppRuntime) -> None:
    detector = ContradictionDetector(runtime)
    detector.detect = AsyncMock(return_value=_canned_report())  # type: ignore[method-assign]
    capability = ContradictionCapability(detector=detector, files=[])

    result = await capability._find_contradictions("anything")

    detector.detect.assert_not_awaited()
    assert "No documents attached" in result


def test_instructions_mention_attached_files(runtime: AppRuntime) -> None:
    detector = ContradictionDetector(runtime)
    capability = ContradictionCapability(
        detector=detector,
        files=[_file("doc-a", "alpha.pdf"), _file("doc-b", "beta.pdf")],
    )

    text = capability.instructions
    assert "alpha.pdf" in text
    assert "beta.pdf" in text
    assert "find_contradictions" in text


def test_format_report_clean_run_has_no_findings_block() -> None:
    report = ContradictionReport(
        contradictions=[],
        pages_examined=[1, 2, 3],
        clean=True,
        summary="No contradictions found across 3 pages.",
    )
    formatted = ContradictionCapability.format_report(report)
    assert "No contradictions" in formatted
    assert "Findings" not in formatted
