from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel


class FormField(ApiModel):
    """PDF form field metadata for AI reasoning. Mirrors Java FormFieldWithCoordinates without widget coordinates."""

    name: str
    label: str | None = None
    type: str
    value: str | None = None
    options: list[str] | None = None
    display_options: list[str] | None = None
    required: bool = False
    read_only: bool = False
    multi_select: bool = False
    multiline: bool = False
    tooltip: str | None = None
    nearby_page_text: str | None = None


class FieldMapping(ApiModel):
    field_name: str
    knowledge_key: str
    value: str


class CleanedLabel(ApiModel):
    field_name: str
    label: str


class KnowledgeEntry(ApiModel):
    key: str
    value: str
    source: str


class DocumentText(ApiModel):
    file_name: str
    text: str


class DocumentExtractionRequest(ApiModel):
    documents: list[DocumentText]
    existing_profile_names: list[str] = Field(default_factory=list)


class ProposedProfile(ApiModel):
    suggested_name: str
    entries: list[KnowledgeEntry]
    source_documents: list[str]


class MultiProfileExtractionResponse(ApiModel):
    outcome: Literal["multi_profile_extraction"] = "multi_profile_extraction"
    proposed_profiles: list[ProposedProfile]
    message: str


class DetectedRole(ApiModel):
    role_label: str
    field_names: list[str]
    is_primary_person: bool


class KnowledgeUpdateResponse(ApiModel):
    outcome: Literal["knowledge_update"] = "knowledge_update"
    proposed_entries: list[KnowledgeEntry]
    message: str


# --- Form Analysis (multi-file) ---


class FileFieldSet(ApiModel):
    file_id: str
    file_name: str
    form_fields: list[FormField] = Field(default_factory=list)


class FormAnalysisRequest(ApiModel):
    files: list[FileFieldSet]


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
    file_id: str
    form_fields: list[FormField] = Field(default_factory=list)
    role_label: str


class FormFillBatchRequest(ApiModel):
    files: list[FileFillRequest]
    knowledge: dict[str, str] = Field(default_factory=dict)


class FileFillResult(ApiModel):
    file_id: str
    filled_fields: list[FieldMapping]


class FormFillBatchResponse(ApiModel):
    outcome: Literal["batch_fill_result"] = "batch_fill_result"
    per_file: list[FileFillResult]
    message: str


DocumentExtractionResponse = Annotated[
    KnowledgeUpdateResponse | MultiProfileExtractionResponse,
    Field(discriminator="outcome"),
]
