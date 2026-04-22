from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ConversationMessage, WorkflowOutcome

MAX_FILES_PER_REQUEST = 50
MAX_FIELDS_PER_FILE = 500
MAX_DOCUMENTS_PER_REQUEST = 20
MAX_LABEL_CHARS = 500
MAX_TOOLTIP_CHARS = 1000
MAX_PAGE_TEXT_CHARS = 8000
MAX_DOCUMENT_TEXT_CHARS = 50000
MAX_KNOWLEDGE_ENTRIES = 500
MAX_KNOWLEDGE_KEY_CHARS = 200
MAX_KNOWLEDGE_VALUE_CHARS = 2000


class FormField(ApiModel):
    """PDF form field metadata for AI reasoning. Mirrors Java FormFieldWithCoordinates without widget coordinates."""

    name: str = Field(max_length=MAX_KNOWLEDGE_KEY_CHARS)
    label: str | None = Field(default=None, max_length=MAX_LABEL_CHARS)
    type: str = Field(max_length=50)
    value: str | None = Field(default=None, max_length=MAX_KNOWLEDGE_VALUE_CHARS)
    options: list[str] | None = None
    display_options: list[str] | None = None
    required: bool = False
    read_only: bool = False
    multi_select: bool = False
    multiline: bool = False
    tooltip: str | None = Field(default=None, max_length=MAX_TOOLTIP_CHARS)
    nearby_page_text: str | None = Field(default=None, max_length=MAX_PAGE_TEXT_CHARS)


class FieldMapping(ApiModel):
    field_name: str
    knowledge_key: str
    value: str


class CleanedLabel(ApiModel):
    field_name: str
    label: str


class KnowledgeEntry(ApiModel):
    key: str = Field(max_length=MAX_KNOWLEDGE_KEY_CHARS)
    value: str = Field(max_length=MAX_KNOWLEDGE_VALUE_CHARS)
    source: str = Field(max_length=MAX_LABEL_CHARS)


class DocumentText(ApiModel):
    file_name: str = Field(max_length=500)
    text: str = Field(max_length=MAX_DOCUMENT_TEXT_CHARS)


class DocumentExtractionRequest(ApiModel):
    documents: list[DocumentText] = Field(min_length=1, max_length=MAX_DOCUMENTS_PER_REQUEST)
    existing_profile_names: list[str] = Field(default_factory=list, max_length=500)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class ProposedProfile(ApiModel):
    suggested_name: str
    entries: list[KnowledgeEntry]
    source_documents: list[str]


class MultiProfileExtractionResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.MULTI_PROFILE_EXTRACTION] = WorkflowOutcome.MULTI_PROFILE_EXTRACTION
    proposed_profiles: list[ProposedProfile]
    message: str


class DetectedRole(ApiModel):
    role_label: str
    field_names: list[str]
    is_primary_person: bool


class KnowledgeUpdateResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.KNOWLEDGE_UPDATE] = WorkflowOutcome.KNOWLEDGE_UPDATE
    proposed_entries: list[KnowledgeEntry]
    message: str


# --- Form Analysis (multi-file) ---


class FileFieldSet(ApiModel):
    file_id: str = Field(max_length=200)
    file_name: str = Field(max_length=500)
    form_fields: list[FormField] = Field(default_factory=list, max_length=MAX_FIELDS_PER_FILE)


class FormAnalysisRequest(ApiModel):
    files: list[FileFieldSet] = Field(min_length=1, max_length=MAX_FILES_PER_REQUEST)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class AnalysedFileResult(ApiModel):
    file_id: str
    file_name: str
    detected_roles: list[DetectedRole]
    cleaned_labels: list[CleanedLabel] = Field(default_factory=list)
    skipped_field_names: list[str] = Field(default_factory=list)


class CrossFileRole(ApiModel):
    role_label: str
    file_ids: list[str]
    field_names_by_file: dict[str, list[str]]
    is_primary_person: bool


class FormAnalysisResponse(ApiModel):
    per_file: list[AnalysedFileResult]
    cross_file_roles: list[CrossFileRole]
    message: str


# --- Batch Fill ---


class FileFillRequest(ApiModel):
    file_id: str = Field(max_length=200)
    form_fields: list[FormField] = Field(default_factory=list, max_length=MAX_FIELDS_PER_FILE)
    role_label: str = Field(max_length=MAX_LABEL_CHARS)


class FormFillBatchRequest(ApiModel):
    files: list[FileFillRequest] = Field(min_length=1, max_length=MAX_FILES_PER_REQUEST)
    knowledge: dict[str, str] = Field(default_factory=dict, max_length=MAX_KNOWLEDGE_ENTRIES)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class FileFillResult(ApiModel):
    file_id: str
    filled_fields: list[FieldMapping]


class FormFillBatchResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.BATCH_FILL_RESULT] = WorkflowOutcome.BATCH_FILL_RESULT
    per_file: list[FileFillResult]
    message: str


DocumentExtractionResponse = Annotated[
    KnowledgeUpdateResponse | MultiProfileExtractionResponse,
    Field(discriminator="outcome"),
]
