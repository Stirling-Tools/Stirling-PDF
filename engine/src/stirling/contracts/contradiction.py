"""
Contradiction Agent — shared models for the Java-Python protocol.

Mirrors the layout of ``contracts/ledger.py`` for the math auditor: every
struct that crosses the wire lives here so the contract is impossible to
miss or partially implement. The contradiction agent reuses the
``Folio``, ``FolioManifest``, ``Requisition``, ``Evidence`` and
``FolioType`` models verbatim — they are re-exported here for callers
that want a single import location.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field

from stirling.contracts.ledger import (
    Evidence,
    Folio,
    FolioManifest,
    FolioType,
    Requisition,
)
from stirling.models import ApiModel

# Re-exports so callers can `from stirling.contracts.contradiction import Folio` etc.
__all__ = [
    "Claim",
    "Contradiction",
    "ContradictionSeverity",
    "ContradictionVerdict",
    "Evidence",
    "Folio",
    "FolioManifest",
    "FolioType",
    "Requisition",
]


# ---------------------------------------------------------------------------
# Severity — must stay in lockstep with the Java enum
# ---------------------------------------------------------------------------


class ContradictionSeverity(StrEnum):
    """Severity of a textual contradiction.

    Java counterpart: ContradictionSeverity.java - values must stay in sync.
    """

    ERROR = "error"  # definite logical contradiction
    WARNING = "warning"  # plausible tension, possible paraphrase / hedging


# ---------------------------------------------------------------------------
# Claim — atomic factual assertion extracted from one page
# ---------------------------------------------------------------------------


class Claim(ApiModel):
    """A single atomic factual claim extracted from a page.

    Polarity captures the directionality of the claim relative to the
    subject — opposing polarities on the same canonical subject are the
    primary signal for the contradiction detector.
    """

    page: int = Field(ge=0, description="0-indexed page number where the claim was found.")
    subject: str = Field(
        min_length=1,
        description="Short noun phrase naming what the claim is about (e.g. 'project deadline').",
    )
    polarity: Literal["assert", "deny", "recommend", "reject", "neutral"] = Field(
        description="Stance the claim takes toward the subject.",
    )
    text: str = Field(
        min_length=1,
        description="One-sentence paraphrase of the claim in the document's language.",
    )
    quote: str = Field(
        min_length=1,
        max_length=400,
        description="Verbatim excerpt from the page (≤200 chars in normal use).",
    )


# ---------------------------------------------------------------------------
# Contradiction — a pair of claims that cannot both be true
# ---------------------------------------------------------------------------


class Contradiction(ApiModel):
    """Two claims about the same subject that cannot both be true."""

    subject: str = Field(min_length=1, description="Canonical subject shared by both claims.")
    claim1: Claim
    claim2: Claim
    explanation: str = Field(
        min_length=1,
        description="One-sentence explanation of why the claims conflict.",
    )
    severity: ContradictionSeverity

    @property
    def page1(self) -> int:
        """Lower-numbered page of the pair (sorted ascending)."""
        return min(self.claim1.page, self.claim2.page)

    @property
    def page2(self) -> int:
        """Higher-numbered page of the pair (sorted ascending)."""
        return max(self.claim1.page, self.claim2.page)


# ---------------------------------------------------------------------------
# ContradictionVerdict — the final report
# ---------------------------------------------------------------------------


class ContradictionVerdict(ApiModel):
    """Final verdict from the contradiction agent.

    Returned to Java as the terminal message and also re-attached to
    follow-up orchestrator turns via ``ContradictionToolReportArtifact``.
    """

    type: Literal["contradiction_verdict"] = "contradiction_verdict"
    session_id: str
    contradictions: list[Contradiction] = Field(default_factory=list)
    pages_examined: list[int] = Field(
        description=(
            "0-indexed pages whose claims were actually checked — i.e. pages "
            "that arrived with non-empty readable text and reached the claim "
            "extractor. Folios that arrived blank are EXCLUDED. Pages whose "
            "extraction failed upstream (e.g. OCR-required but not wired) "
            "appear in `unauditable_pages` instead."
        )
    )
    rounds_taken: int = Field(ge=1, le=3)
    summary: str = Field(description="One or two sentences summarising the audit outcome.")
    clean: bool = Field(description="True iff no ERROR-severity contradictions were found.")
    unauditable_pages: list[int] = Field(
        default_factory=list,
        description=(
            "0-indexed pages that could not be audited — typically because OCR was "
            "requested but is not yet wired."
        ),
    )

    @property
    def error_count(self) -> int:
        return sum(1 for c in self.contradictions if c.severity == ContradictionSeverity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for c in self.contradictions if c.severity == ContradictionSeverity.WARNING)
