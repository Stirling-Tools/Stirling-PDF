"""Contracts for the PDF Create Agent.

The agent accepts a natural-language prompt and returns a single
CREATE_PDF_FROM_HTML_AGENT plan step carrying the rendered HTML.

Pipeline:
  1. PlannerAgent (smart_model) → DocumentPlan: structured skeleton, no body text.
  2. Python chunks the plan by token budget.
  3. SectionWriterAgents (smart_model, parallel) → WrittenSections per chunk.
  4. Assembler collects sections in plan order → GeneratedDocument.
  5. Jinja renders GeneratedDocument → HTML. The LLM never writes HTML.
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, field_validator

from stirling.models import ApiModel

from .common import ConversationMessage
from .pdf_edit import EditCannotDoResponse, EditPlanResponse


class SectionType(StrEnum):
    TEXT = "text"
    KEY_VALUE = "key_value"
    LINE_ITEMS = "line_items"
    BULLET_LIST = "bullet_list"
    SIGNATURE = "signature"


class TextSection(ApiModel):
    """One or more prose paragraphs. Use for introductions, summaries, and narrative content."""

    type: Literal[SectionType.TEXT] = SectionType.TEXT
    heading: str | None = None
    body: str = Field(description="Paragraph text. Use \\n\\n to separate paragraphs.")


class KeyValueSection(ApiModel):
    """Labelled fields. Use for contact info, dates, invoice details, and metadata."""

    type: Literal[SectionType.KEY_VALUE] = SectionType.KEY_VALUE
    heading: str | None = None
    pairs: list[tuple[str, str]] = Field(description="List of (label, value) pairs.")


class LineItemsSection(ApiModel):
    """A table with column headers and data rows. Use for invoices, expenses, schedules."""

    type: Literal[SectionType.LINE_ITEMS] = SectionType.LINE_ITEMS
    heading: str | None = None
    columns: list[str] = Field(description="Column header names.")
    rows: list[list[str]] = Field(description="Data rows; each row must match columns in length.")
    total_row: list[str] | None = None


class BulletListSection(ApiModel):
    """An unordered list. Use for requirements, responsibilities, or any enumerated items."""

    type: Literal[SectionType.BULLET_LIST] = SectionType.BULLET_LIST
    heading: str | None = None
    items: list[str]


class SignatureSection(ApiModel):
    """Signature blocks. Use when the document requires sign-off from named parties."""

    type: Literal[SectionType.SIGNATURE] = SectionType.SIGNATURE
    heading: str | None = None
    signatories: list[str] = Field(description="Names or roles to sign, e.g. 'John Smith, CEO'.")


type DocumentSection = Annotated[
    TextSection | KeyValueSection | LineItemsSection | BulletListSection | SignatureSection,
    Field(discriminator="type"),
]


# Named colour or hex only — anything else is dropped so a colour can't inject CSS into the
# <style> block (which would let WeasyPrint fetch an attacker-controlled url() → SSRF).
_SAFE_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")


class DocumentStyle(ApiModel):
    """Document colours, inferred by the meta planner and rendered into the engine's Jinja
    template (never sent to Java). Unsafe colours are dropped to ``None``."""

    primary_color: str | None = Field(default=None)
    background_color: str | None = Field(default=None)
    body_text_color: str | None = Field(default=None)

    @field_validator("primary_color", "background_color", "body_text_color", mode="after")
    @classmethod
    def _drop_unsafe_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value if _SAFE_COLOR_RE.fullmatch(value) else None


class GeneratedDocument(ApiModel):
    """The full document model passed to Jinja for HTML rendering."""

    title: str
    subtitle: str | None = None
    reference_number: str | None = None
    style: DocumentStyle | None = None
    sections: list[DocumentSection]


# ── Planner models ────────────────────────────────────────────────────────────────────────────────


class SectionDepth(StrEnum):
    BRIEF = "brief"
    STANDARD = "standard"
    DETAILED = "detailed"


class PlannedSection(ApiModel):
    """One section in the document plan. Contains structure and intent — no body text."""

    heading: str
    type: SectionType
    depth: SectionDepth
    key_points: list[str]


class DocumentMeta(ApiModel):
    """Document header fields produced by the first planner call.

    Contains everything except the section list. Kept deliberately flat so the
    JSON schema stays small enough for grammar compilation on all model tiers.
    Style is expressed as three flat optional strings rather than a nested object
    for the same reason; assemble() reconstructs DocumentStyle from them.
    """

    cannot_do_reason: str | None = None
    title: str = ""
    subtitle: str | None = None
    reference_number: str | None = None
    tone_brief: str = ""
    shared_terms: dict[str, str] = Field(default_factory=dict)
    document_context: str = ""
    style_primary_color: str | None = None
    style_background_color: str | None = None
    style_body_text_color: str | None = None


class DocumentSections(ApiModel):
    """Section list produced by the second planner call."""

    sections: list[PlannedSection] = Field(default_factory=list)


class DocumentPlan(ApiModel):
    """Assembled plan: meta + sections. Not used as a direct LLM output schema."""

    cannot_do_reason: str | None = None
    title: str = ""
    subtitle: str | None = None
    reference_number: str | None = None
    tone_brief: str = ""
    shared_terms: dict[str, str] = Field(default_factory=dict)
    document_context: str = ""
    style: DocumentStyle | None = None
    sections: list[PlannedSection] = Field(default_factory=list)

    @classmethod
    def assemble(cls, meta: DocumentMeta, sections: DocumentSections) -> DocumentPlan:
        style_fields = {
            "primary_color": meta.style_primary_color,
            "background_color": meta.style_background_color,
            "body_text_color": meta.style_body_text_color,
        }
        inferred_style = DocumentStyle(**style_fields) if any(style_fields.values()) else None
        return cls(
            cannot_do_reason=meta.cannot_do_reason,
            title=meta.title,
            subtitle=meta.subtitle,
            reference_number=meta.reference_number,
            tone_brief=meta.tone_brief,
            shared_terms=meta.shared_terms,
            document_context=meta.document_context,
            style=inferred_style,
            sections=sections.sections,
        )


class WrittenSections(ApiModel):
    """Sections produced by one section-writer agent for one chunk."""

    sections: list[DocumentSection]


# ── Request/response contracts ───────────────────────────────────────────────────────────────────


class PdfCreateRequest(ApiModel):
    user_message: str
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class PdfCreateSuccessResponse(ApiModel):
    outcome: Literal["document_created"] = "document_created"
    document: GeneratedDocument


class PdfCreateCannotDoResponse(ApiModel):
    outcome: Literal["cannot_do"] = "cannot_do"
    reason: str


type PdfCreateResponse = Annotated[
    PdfCreateSuccessResponse | PdfCreateCannotDoResponse,
    Field(discriminator="outcome"),
]

type PdfCreateOrchestrateResponse = Annotated[
    EditPlanResponse | EditCannotDoResponse,
    Field(discriminator="outcome"),
]
