"""Contracts for the PDF to Markdown Agent.

The agent accepts a parsed document and returns a single Markdown document that
faithfully reconstructs the PDF content — headings, paragraphs, and tables in
reading order, using page_layout as the primary source of truth for structure.

Java extracts page layout via PdfIngester and returns it as a PageLayoutArtifact
through the orchestrator resume_with pattern.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ArtifactKind, ConversationMessage, NeedContentResponse
from .pdf_edit import EditCannotDoResponse, EditPlanResponse

# ── Input: layout models (mirror Java's RawLine / TextFragment geometry) ────────────────────────


class LayoutFragment(ApiModel):
    """One text fragment with its bounding-box geometry and font properties."""

    text: str
    x: float
    y: float
    width: float
    font_size: float
    bold: bool


class LayoutLine(ApiModel):
    """A visual line on the page: one y-coordinate and all fragments on that line."""

    y: float
    fragments: list[LayoutFragment]


class PageLayout(ApiModel):
    """All layout lines for a single page, in top-to-bottom order."""

    page_number: int
    lines: list[LayoutLine]


# ── Artifact: page layout (produced by Java, consumed by orchestrate()) ──────────────────────────


class PageLayoutFileEntry(ApiModel):
    """Page layout data for one file, as extracted by Java's PdfIngester."""

    file_name: str
    pages: list[PageLayout] = Field(default_factory=list)


class PageLayoutArtifact(ApiModel):
    """Artifact carrying full spatial page layout for all input files."""

    kind: Literal[ArtifactKind.PAGE_LAYOUT] = ArtifactKind.PAGE_LAYOUT
    files: list[PageLayoutFileEntry] = Field(default_factory=list)


# ── Input: full request ──────────────────────────────────────────────────────────────────────────


class PdfToMarkdownRequest(ApiModel):
    """Request sent by Java after PdfIngester has parsed the document.

    page_layout: per-fragment positional data from the original (y-sorted) line order.
        Each fragment carries its x/y position, width, font size, and bold flag.
        This is the primary source of truth for column detection and heading hierarchy.
    """

    user_message: str
    file_names: list[str] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    page_layout: list[PageLayout] = Field(default_factory=list)


# ── Output: response variants ────────────────────────────────────────────────────────────────────


class PdfToMarkdownSuccessResponse(ApiModel):
    outcome: Literal["document_reconstructed"] = "document_reconstructed"
    markdown: str


class PdfToMarkdownCannotDoResponse(ApiModel):
    outcome: Literal["cannot_do"] = "cannot_do"
    reason: str


type PdfToMarkdownResponse = Annotated[
    PdfToMarkdownSuccessResponse | PdfToMarkdownCannotDoResponse,
    Field(discriminator="outcome"),
]

type PdfToMarkdownOrchestrateResponse = Annotated[
    EditPlanResponse | EditCannotDoResponse | NeedContentResponse,
    Field(discriminator="outcome"),
]
