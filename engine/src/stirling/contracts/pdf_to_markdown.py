"""Contracts for the PDF to Markdown Agent.

The agent accepts a parsed document and returns a single Markdown document that
faithfully reconstructs the PDF content — headings, paragraphs, and tables in
reading order, using page_layout as the primary source of truth for structure.

Java counterpart: the Java layer runs PdfIngester to produce ParsedDocument, then
calls POST /api/v1/pdf/to-markdown with the parsed tables, layout, text, and page images.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ConversationMessage, ExtractedFileText, WorkflowOutcome

# ── Input: parsed table models (mirror Java's TableFragment) ────────────────────────────────────


class ParsedTable(ApiModel):
    """A single table as extracted by the Java parser layer.

    Mirrors Java's TableFragment. raw_rows is the authoritative flat representation.
    confidence and warnings come from TabulaTableParser or LineAlignmentTableParser and are
    used only as hints — the reconstruction agent uses page_layout as the primary source of truth.
    """

    table_id: str
    page_number: int
    raw_rows: list[list[str]] = Field(default_factory=list)
    column_count: int
    confidence: float
    warnings: list[str] = Field(default_factory=list)


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


# ── Input: full request ──────────────────────────────────────────────────────────────────────────


class PdfToMarkdownRequest(ApiModel):
    """Request sent by Java after PdfIngester has parsed the document.

    parsed_tables: parser hints only — used as unreliable supplementary context.
    page_text: extracted page text — fallback reference for the reconstruction LLM.
    page_layout: per-fragment positional data from the original (y-sorted) line order.
        Each fragment carries its x/y position, width, font size, and bold flag.
        This is the primary source of truth for column detection and heading hierarchy.
    """

    user_message: str
    file_names: list[str] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    parsed_tables: list[ParsedTable] = Field(default_factory=list)
    page_text: list[ExtractedFileText] = Field(default_factory=list)
    page_layout: list[PageLayout] = Field(default_factory=list)


# ── Output: response variants ────────────────────────────────────────────────────────────────────


class PdfToMarkdownSuccessResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.DOCUMENT_RECONSTRUCTED] = WorkflowOutcome.DOCUMENT_RECONSTRUCTED
    markdown: str


class PdfToMarkdownCannotDoResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.CANNOT_DO] = WorkflowOutcome.CANNOT_DO
    reason: str


type PdfToMarkdownResponse = Annotated[
    PdfToMarkdownSuccessResponse | PdfToMarkdownCannotDoResponse,
    Field(discriminator="outcome"),
]
