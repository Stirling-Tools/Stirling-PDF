"""Contradiction Agent — Python-only contract models.

The contradiction agent runs entirely inside the engine: there is no Java
counterpart, no HTTP endpoint, and no discriminated-union resume artifact.
These types are consumed by ``PdfReviewAgent`` (which produces sticky-note
comment specs) and by ``ContradictionCapability`` (which formats the
report as a tool-call payload for the smart model).

Page numbers are 1-indexed to match :class:`stirling.contracts.documents.Page`.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field

from stirling.models import ApiModel

__all__ = [
    "Claim",
    "ClaimPolarity",
    "Contradiction",
    "ContradictionReport",
    "ContradictionSeverity",
]


# Shared type alias for the polarity field. Spelled out once here so the
# detector's internal LLM-output schema and the public Claim contract stay
# in sync — adding a new polarity requires touching one place.
ClaimPolarity = Literal["assert", "deny", "recommend", "reject", "neutral"]


class ContradictionSeverity(StrEnum):
    """Severity of a textual contradiction.

    ``ERROR``: definite logical contradiction (the two claims cannot both be true).
    ``WARNING``: plausible tension; possible paraphrase, hedging, or
    context-dependent reading.
    """

    ERROR = "error"
    WARNING = "warning"


class Claim(ApiModel):
    """A single atomic factual claim extracted from a page.

    ``page`` is 1-indexed (matches :class:`Page.page_number`). The
    ``anchor_quality`` flag records whether ``quote`` was located
    verbatim in the declared page's text — verbatim claims can be
    placed by anchor text; paraphrased claims fall back to deterministic
    margin geometry in the review-comment builder.
    """

    page: int = Field(ge=1, description="1-indexed page number where the claim was found.")
    subject: str = Field(
        min_length=1,
        description="Short noun phrase naming what the claim is about (e.g. 'project deadline').",
    )
    polarity: ClaimPolarity = Field(
        description="Stance the claim takes toward the subject.",
    )
    text: str = Field(
        min_length=1,
        description="One-sentence paraphrase of the claim in the document's language.",
    )
    quote: str = Field(
        min_length=1,
        max_length=400,
        description="Verbatim excerpt from the page (typically <= 400 chars).",
    )
    anchor_quality: Literal["verbatim", "paraphrased"] = Field(
        default="verbatim",
        description=(
            "Whether the ``quote`` was located as a substring inside the declared "
            "page's text. ``verbatim`` claims can be anchored by text search; "
            "``paraphrased`` claims fall back to margin-geometry placement."
        ),
    )
    file_name: str | None = Field(
        default=None,
        description=(
            "Name of the source file this claim was extracted from. Required for "
            "disambiguating claims when the detector audits multiple PDFs that "
            "share page numbers; ``None`` is acceptable for single-file audits "
            "where the answer is unambiguous."
        ),
    )


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
        """Lower-numbered page of the pair."""
        return min(self.claim1.page, self.claim2.page)

    @property
    def page2(self) -> int:
        """Higher-numbered page of the pair."""
        return max(self.claim1.page, self.claim2.page)


class ContradictionReport(ApiModel):
    """Output of :meth:`ContradictionDetector.detect`.

    Lives entirely inside the engine — no Java counterpart. The review
    agent projects this into sticky-note ``CommentSpec`` pairs; the
    question agent's capability formats it into notes-style text for
    the smart model.
    """

    contradictions: list[Contradiction] = Field(default_factory=list)
    pages_examined: list[int] = Field(
        default_factory=list,
        description=(
            "1-indexed pages whose extractor pass ran, regardless of whether "
            "any claims were produced. Pages whose extraction failed "
            "(chunk-level timeout or crash) are excluded. Multi-file audits "
            "may show duplicate page numbers — page 1 from report.pdf and "
            "page 1 from memo.pdf are distinct pages and both count. Per-file "
            "attribution lives on each ``Claim.file_name``."
        ),
    )
    clean: bool = Field(
        description="True iff no ERROR-severity contradictions were found.",
    )
    summary: str = Field(
        description="One or two neutral sentences summarising the audit outcome.",
    )

    @property
    def error_count(self) -> int:
        return sum(1 for c in self.contradictions if c.severity == ContradictionSeverity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for c in self.contradictions if c.severity == ContradictionSeverity.WARNING)
