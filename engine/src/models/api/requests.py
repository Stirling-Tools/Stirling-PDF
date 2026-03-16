from __future__ import annotations

from pydantic import Field

from ..base import ApiModel
from ..chat import ChatMessage
from ..common import Constraint, DraftSection


class IntentCheckRequest(ApiModel):
    prompt: str = ""
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    current_pdf_url: str | None = None


class DetectTypeRequest(ApiModel):
    prompt: str = ""
    explicit_type: str | None = None


class PdfAnswerRequest(ApiModel):
    pdf_url: str | None = None
    question: str | None = None


class CreateSessionRequest(ApiModel):
    prompt: str = ""
    doc_type: str = ""
    template_id: str = ""


class UpdateOutlineRequest(ApiModel):
    outline_text: str = ""
    constraints: Constraint | None = None
    outline_filename: str | None = None


class UpdateDraftRequest(ApiModel):
    draft_sections: list[DraftSection] = Field(default_factory=list)


class UpdateTemplateRequest(ApiModel):
    doc_type: str | None = None
    template_id: str | None = None


class RepromptRequest(ApiModel):
    prompt: str = ""


class FillFieldsRequest(ApiModel):
    fields: list[dict[str, str]] = Field(default_factory=list)
    extra_prompt: str = ""


class GenerateSectionRequest(ApiModel):
    session_id: str | None = None
    section_label: str = ""
    section_index: int = 0
    custom_prompt: str = ""
    document_prompt: str = ""
    doc_type: str = "document"
    existing_sections: list[DraftSection] = Field(default_factory=list)


class GenerateAllSectionsRequest(ApiModel):
    session_id: str | None = None
    document_prompt: str = ""
    doc_type: str = "document"
    sections: list[DraftSection] = Field(default_factory=list)
    only_indices: list[int] | None = None
    additional_prompt: str = ""
