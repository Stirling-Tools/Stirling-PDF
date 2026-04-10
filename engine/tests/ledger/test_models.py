"""
Ledger models — unit tests for serialisation and business logic.

These tests confirm the wire contract: models round-trip through JSON
correctly and their helper properties behave as documented.
"""

import pytest
from pydantic import ValidationError

from stirling.contracts.ledger import (
    Discrepancy,
    DiscrepancyKind,
    Evidence,
    Folio,
    FolioManifest,
    FolioType,
    Requisition,
    Severity,
    Verdict,
)

# ---------------------------------------------------------------------------
# FolioManifest
# ---------------------------------------------------------------------------


def test_folio_manifest_round_trip() -> None:
    manifest = FolioManifest(
        session_id="abc-123",
        page_count=3,
        folio_types=[FolioType.TEXT, FolioType.IMAGE, FolioType.MIXED],
    )
    reloaded = FolioManifest.model_validate_json(manifest.model_dump_json())
    assert reloaded == manifest


def test_folio_manifest_round_bounds() -> None:
    with pytest.raises(ValidationError):
        FolioManifest(session_id="x", page_count=1, folio_types=[FolioType.TEXT], round=0)
    with pytest.raises(ValidationError):
        FolioManifest(session_id="x", page_count=1, folio_types=[FolioType.TEXT], round=4)


# ---------------------------------------------------------------------------
# Requisition
# ---------------------------------------------------------------------------


def test_requisition_empty() -> None:
    req = Requisition(rationale="nothing needed")
    assert req.need_text == []
    assert req.need_tables == []
    assert req.need_ocr == []


def test_requisition_type_discriminator() -> None:
    req = Requisition(need_text=[0, 1], rationale="needs text")
    assert req.type == "requisition"


# ---------------------------------------------------------------------------
# Folio.readable_text
# ---------------------------------------------------------------------------


def test_folio_readable_text_prefers_ocr() -> None:
    folio = Folio(page=0, text="digital text", ocr_text="ocr text")
    assert folio.readable_text == "ocr text"


def test_folio_readable_text_falls_back_to_text() -> None:
    folio = Folio(page=0, text="digital text")
    assert folio.readable_text == "digital text"


def test_folio_readable_text_empty_when_none() -> None:
    folio = Folio(page=0)
    assert folio.readable_text == ""


# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------


def test_verdict_clean_flag() -> None:
    verdict = Verdict(
        session_id="s1",
        discrepancies=[],
        pages_examined=[0, 1],
        rounds_taken=2,
        summary="All figures balance.",
        clean=True,
    )
    assert verdict.error_count == 0
    assert verdict.warning_count == 0
    assert verdict.clean is True


def test_verdict_error_and_warning_counts() -> None:
    discrepancies = [
        Discrepancy(
            page=0,
            kind=DiscrepancyKind.TALLY,
            severity=Severity.ERROR,
            description="bad sum",
            stated="100",
            expected="110",
        ),
        Discrepancy(
            page=1,
            kind=DiscrepancyKind.CONSISTENCY,
            severity=Severity.WARNING,
            description="mismatched figure",
            stated="500",
            expected="550",
        ),
    ]
    verdict = Verdict(
        session_id="s1",
        discrepancies=discrepancies,
        pages_examined=[0, 1],
        rounds_taken=1,
        summary="Issues found.",
        clean=False,
    )
    assert verdict.error_count == 1
    assert verdict.warning_count == 1


# ---------------------------------------------------------------------------
# Evidence.final_round
# ---------------------------------------------------------------------------


def test_evidence_final_round() -> None:
    evidence = Evidence(
        session_id="s",
        folios=[Folio(page=0, text="hello")],
        round=3,
        final_round=True,
    )
    assert evidence.final_round is True
