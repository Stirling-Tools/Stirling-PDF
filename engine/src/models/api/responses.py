from __future__ import annotations

from pydantic import Field

from ..base import ApiModel
from ..common import DraftSection, FieldValue


class OutlineSection(ApiModel):
    """A single section in the document outline with pre-filled content."""

    label: str = Field(description="Section title/header")
    value: str = Field(description="Pre-filled content extracted from user's prompt")


class OutlineResponse(ApiModel):
    """Structured outline with detected document type and sections."""

    doc_type: str = Field(description="Detected document type")
    sections: list[OutlineSection]
    outline_filename: str | None = None


class DocTypeClassification(ApiModel):
    doc_type: str


class SectionContent(ApiModel):
    content: str


class HtmlResponse(ApiModel):
    html: str


class PdfAnswer(ApiModel):
    answer: str
    evidence: list[str] = Field(default_factory=list)


class MissingQuestionsResponse(ApiModel):
    message: str


class LLMFieldValuesResponse(ApiModel):
    fields: list[FieldValue]


class LLMDraftSectionsResponse(ApiModel):
    sections: list[DraftSection]


class IntentCheckResponse(ApiModel):
    wants_pdf: bool | None = None
    has_enough_info: bool | None = None
    document_type: str | None = None
    missing_fields: list[str] | None = None
    doc_type: str | None = None
    has_pdf: bool | None = None
    reason: str | None = None


class DetectTypeResponse(ApiModel):
    doc_type: str | None = None
    confidence: str | None = None
    method: str | None = None
    error: str | None = None


class PdfAnswerResponse(ApiModel):
    answer: str | None = None
    mode: str | None = None
    error: str | None = None


class NeedsInfoResponse(ApiModel):
    needs_info: bool | None = None
    message: str | None = None
    missing: list[str] | None = None
    collected: dict[str, str] | None = None
    doc_type: str | None = None


class VersionEntry(ApiModel):
    id: str
    prompt: str
    doc_type: str
    pdf_url: str
    created_at: str
    template_used: bool
    edit_mode: bool


class GenerateSuccessResponse(ApiModel):
    pdf_url: str
    doc_type: str
    message: str
    version: VersionEntry
    template_used: bool
    editing_existing: bool


class GenerateErrorResponse(ApiModel):
    error: str
    editing_existing: bool


class ErrorDetailResponse(ApiModel):
    error: str
    detail: str


class CreateSessionResponse(ApiModel):
    session_id: str
    doc_type: str
    detection_method: str
    template_html: str | None = None  # Selected .html template, or None


class SuccessResponse(ApiModel):
    success: bool


class FillFieldsResponse(ApiModel):
    fields: list[dict[str, str]]


class GenerateSectionResponse(ApiModel):
    content: str | None = None
    section_index: int | None = None
    error: str | None = None


class GenerateAllSectionsResponse(ApiModel):
    sections: list[DraftSection] | None = None
    incomplete_section_indices: list[int] | None = None
    error: str | None = None


class VersionsResponse(ApiModel):
    versions: list[VersionEntry]


class UploadAssetResponse(ApiModel):
    asset_id: str
    asset_url: str


class PdfEditorUploadResponse(ApiModel):
    pdf_url: str


class HealthResponse(ApiModel):
    status: str
    engine: str
