"""
Ledger Auditor — shared models for the Java-Python protocol.

Every struct that crosses the wire lives here so the contract is
impossible to miss or partially implement.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field

from stirling.models import ApiModel

# ---------------------------------------------------------------------------
# Page classification — Java's side of the conversation
# ---------------------------------------------------------------------------


class FolioType(StrEnum):
    """How Java classifies each page after a cheap PDFBox scan.

    Java counterpart: FolioType.java - values must stay in sync.
    """

    TEXT = "text"  # selectable text layer present
    IMAGE = "image"  # image-only, will need OCR
    MIXED = "mixed"  # partial text layer + embedded images


class FolioManifest(ApiModel):
    """
    Java's opening move: a fast, cheap page classification with no OCR or
    table extraction — just PDFBox character counts and image detection.

    Python inspects this and returns a Requisition declaring what it needs.
    """

    session_id: str = Field(description="Opaque handle Java uses to find the PDF on disk.")
    page_count: int = Field(ge=1)
    folio_types: list[FolioType] = Field(description="One entry per page (0-indexed). len(folio_types) == page_count.")
    round: int = Field(default=1, ge=1, le=3, description="Which negotiation round this is.")


# ---------------------------------------------------------------------------
# Requisition — Python's declaration of what it needs
# ---------------------------------------------------------------------------


class Requisition(ApiModel):
    """
    Python's reply to a FolioManifest: a precise shopping list of what Java
    must extract before the auditor can form an opinion.

    Java fulfils this and sends back an Evidence payload.
    """

    type: Literal["requisition"] = "requisition"
    need_text: list[int] = Field(
        default_factory=list,
        description="0-indexed page numbers. Java runs PDFBox text extraction on these.",
    )
    need_tables: list[int] = Field(
        default_factory=list,
        description="0-indexed page numbers. Java runs Tabula CSV extraction on these.",
    )
    need_ocr: list[int] = Field(
        default_factory=list,
        description="0-indexed page numbers. Java runs OCRmyPDF on these.",
    )
    rationale: str = Field(description="Plain-language reason, written for log readability, not the client.")


# ---------------------------------------------------------------------------
# Evidence — Java's fulfilment of a Requisition
# ---------------------------------------------------------------------------


class Folio(ApiModel):
    """
    One page's worth of extracted content — whatever Java was able to provide
    in response to the Requisition for that page.
    """

    page: int = Field(ge=0, description="0-indexed page number.")
    text: str | None = Field(default=None, description="PDFBox plain-text extraction.")
    tables: list[str] | None = Field(default=None, description="Tabula CSV strings, one per table found on the page.")
    ocr_text: str | None = Field(default=None, description="OCRmyPDF output text.")
    ocr_confidence: float | None = Field(
        default=None, ge=0.0, le=1.0, description="Mean character confidence from OCRmyPDF."
    )

    @property
    def readable_text(self) -> str:
        """Best available text for this folio — OCR wins over digital when present."""
        return self.ocr_text or self.text or ""


class Evidence(ApiModel):
    """
    Java's fulfilment package: the extracted content Python asked for.
    Java may also set final_round=True on the last allowable round to signal
    that the auditor must return a Verdict regardless of remaining questions.
    """

    session_id: str
    folios: list[Folio]
    round: int = Field(ge=1, le=3)
    final_round: bool = Field(
        default=False,
        description="When True, Java will not honour further Requisitions. "
        "The auditor must return a Verdict this round.",
    )
    unauditable_pages: list[int] = Field(
        default_factory=list,
        description=(
            "Pages that were requested in the Requisition but could not be fulfilled — "
            "e.g. OCR was asked for but is not wired. The Auditor echoes these into "
            "Verdict.unauditable_pages so the client knows coverage is incomplete."
        ),
    )


# ---------------------------------------------------------------------------
# Findings — what the auditor discovers
# ---------------------------------------------------------------------------


class DiscrepancyKind(StrEnum):
    """Java counterpart: DiscrepancyKind.java - values must stay in sync."""

    TALLY = "tally"  # a row/column sum is wrong
    ARITHMETIC = "arithmetic"  # an inline calculation is wrong
    CONSISTENCY = "consistency"  # the same figure is stated differently elsewhere
    STATEMENT = "statement"  # a prose claim contradicts the numbers


class Severity(StrEnum):
    """Java counterpart: AuditSeverity.java - values must stay in sync."""

    ERROR = "error"  # definite arithmetic mistake
    WARNING = "warning"  # possible rounding or ambiguity


class Discrepancy(ApiModel):
    """A single mathematical error found in the document."""

    page: int = Field(ge=0)
    kind: DiscrepancyKind
    severity: Severity
    description: str = Field(description="Human-readable explanation of the error.")
    stated: str = Field(description="The value as it appears in the document.")
    expected: str = Field(description="The value the auditor calculated.")
    context: str = Field(
        default="",
        description="Surrounding text or table fragment for traceability.",
    )


# ---------------------------------------------------------------------------
# Verdict — the final report
# ---------------------------------------------------------------------------


class Verdict(ApiModel):
    """
    The auditor's final opinion on the document's mathematical integrity.
    Returned to Java as the terminal message in the negotiation.
    """

    type: Literal["verdict"] = "verdict"
    session_id: str
    discrepancies: list[Discrepancy] = Field(default_factory=list)
    pages_examined: list[int] = Field(description="0-indexed page numbers the auditor actually inspected.")
    rounds_taken: int = Field(ge=1, le=3)
    summary: str = Field(description="One or two sentences summarising the audit outcome for the client.")
    clean: bool = Field(description="True iff no errors were found (warnings are tolerated).")
    unauditable_pages: list[int] = Field(
        default_factory=list,
        description=(
            "0-indexed pages that could not be audited — typically because OCR was "
            "requested but is not yet wired. Java populates this by omitting the folio "
            "and the Auditor echoes the page number here so the client knows coverage "
            "is incomplete."
        ),
    )

    @property
    def error_count(self) -> int:
        return sum(1 for d in self.discrepancies if d.severity == Severity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for d in self.discrepancies if d.severity == Severity.WARNING)
