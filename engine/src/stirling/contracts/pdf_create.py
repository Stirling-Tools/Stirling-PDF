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

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from stirling.models import ApiModel

from .common import ConversationMessage
from .pdf_edit import EditCannotDoResponse, EditPlanResponse


class SectionType(StrEnum):
    TEXT = "text"
    KEY_VALUE = "key_value"
    LINE_ITEMS = "line_items"
    BULLET_LIST = "bullet_list"
    SIGNATURE = "signature"


class TextSection(BaseModel):
    """One or more prose paragraphs. Use for introductions, summaries, and narrative content."""

    type: Literal[SectionType.TEXT] = SectionType.TEXT
    heading: str | None = None
    body: str = Field(description="Paragraph text. Use \\n\\n to separate paragraphs.")


class KeyValueSection(BaseModel):
    """Labelled fields. Use for contact info, dates, invoice details, and metadata."""

    type: Literal[SectionType.KEY_VALUE] = SectionType.KEY_VALUE
    heading: str | None = None
    pairs: list[tuple[str, str]] = Field(description="List of (label, value) pairs.")


class LineItemsSection(BaseModel):
    """A table with column headers and data rows. Use for invoices, expenses, schedules."""

    type: Literal[SectionType.LINE_ITEMS] = SectionType.LINE_ITEMS
    heading: str | None = None
    columns: list[str] = Field(description="Column header names.")
    rows: list[list[str]] = Field(description="Data rows; each row must match columns in length.")
    total_row: list[str] | None = None


class BulletListSection(BaseModel):
    """An unordered list. Use for requirements, responsibilities, or any enumerated items."""

    type: Literal[SectionType.BULLET_LIST] = SectionType.BULLET_LIST
    heading: str | None = None
    items: list[str]


class SignatureSection(BaseModel):
    """Signature blocks. Use when the document requires sign-off from named parties."""

    type: Literal[SectionType.SIGNATURE] = SectionType.SIGNATURE
    heading: str | None = None
    signatories: list[str] = Field(description="Names or roles to sign, e.g. 'John Smith, CEO'.")


type DocumentSection = Annotated[
    TextSection | KeyValueSection | LineItemsSection | BulletListSection | SignatureSection,
    Field(discriminator="type"),
]


class DocumentStyle(ApiModel):
    """Visual style that crosses the Java↔Python boundary.

    Uses camelCase aliases so it round-trips correctly between the Java service layer
    and the Python engine without transformation. Set by the UI via DocumentStylePicker;
    the meta planner does not infer style (keeps its schema small enough for Haiku).
    """

    primary_color: str | None = Field(default=None)
    background_color: str | None = Field(default=None)
    body_text_color: str | None = Field(default=None)
    font_family: str | None = Field(default=None)
    page_margin: str | None = Field(default=None)


class GeneratedDocument(BaseModel):
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


class PlannedSection(BaseModel):
    """One section in the document plan. Contains structure and intent — no body text."""

    heading: str
    type: SectionType
    depth: SectionDepth
    key_points: list[str]


class DocumentMeta(BaseModel):
    """Document header fields produced by the first planner call.

    Contains everything except the section list. Kept deliberately flat so the
    JSON schema stays small enough for grammar compilation on all model tiers.
    Style is not inferred here — it is set by the UI and applied after assembly.
    """

    cannot_do_reason: str | None = None
    title: str = ""
    subtitle: str | None = None
    reference_number: str | None = None
    tone_brief: str = ""
    shared_terms: dict[str, str] = Field(default_factory=dict)
    document_context: str = ""


class DocumentSections(BaseModel):
    """Section list produced by the second planner call."""

    sections: list[PlannedSection] = Field(default_factory=list)


class DocumentPlan(BaseModel):
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
        return cls(
            cannot_do_reason=meta.cannot_do_reason,
            title=meta.title,
            subtitle=meta.subtitle,
            reference_number=meta.reference_number,
            tone_brief=meta.tone_brief,
            shared_terms=meta.shared_terms,
            document_context=meta.document_context,
            style=None,
            sections=sections.sections,
        )


class WrittenSections(BaseModel):
    """Sections produced by one section-writer agent for one chunk."""

    sections: list[DocumentSection]


# ── Legacy request/response contracts (kept for backward compatibility) ───────────────────────────


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
