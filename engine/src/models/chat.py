from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from .base import ApiModel


class ChatInfoRequest(ApiModel):
    message: str = ""
    history: list[ChatMessage] = Field(default_factory=list)


class ChatInfoResponse(ApiModel):
    assistant_message: str = ""


class InterpretParameterRequest(ApiModel):
    tool_id: str
    tool_name: str
    question: str
    user_response: str


class InterpretParameterResponse(ApiModel):
    type: Literal["value", "confused", "cancel", "default"]
    extracted_value: str | None = None
    help_message: str


class ChatMessage(ApiModel):
    role: Literal["system", "assistant", "user"]
    content: str | list[str | dict]


class ChatTitleExample(ApiModel):
    user: str
    title: str


class ChatTitleContext(ApiModel):
    current_title: str | None = None
    max_length: int | None = None
    style_hint: str | None = None
    examples: list[ChatTitleExample] = Field(default_factory=list)


class EditIntentHint(ApiModel):
    mode: Literal["command", "info", "document_question", "html_edit", "ambiguous"]
    requires_file_context: bool = False


class CreateIntentHint(ApiModel):
    action: Literal["start", "generate_pdf", "regenerate_outline"] = "start"
    doc_type: str | None = None  # Detected document type when action="start"
    template_tex: str | None = None  # Selected .tex from default_templates, or None if unknown


class SmartFolderIntentHint(ApiModel):
    action: Literal["configure", "create"]


class ChatRouteRequest(ApiModel):
    message: str = ""
    history: list[ChatMessage] = Field(default_factory=list)
    has_files: bool = False
    has_editable_html: bool = False
    has_create_session: bool = False
    has_edit_session: bool = False
    last_route: Literal["edit", "create", "none"] = "none"
    request_title: bool = False
    title_context: ChatTitleContext | None = None


class InferToolsRequest(ApiModel):
    message: str
    available_tools: list[str]


class InferredTool(ApiModel):
    tool_id: str
    confidence: Literal["high", "medium", "low"]


class InferToolsResponse(ApiModel):
    tools: list[InferredTool]
    reason: str


class ChatRouteResponse(ApiModel):
    intent: Literal["create", "edit", "smart_folder"]
    create_intent: CreateIntentHint | None = None
    edit_intent: EditIntentHint | None = None
    smart_folder_intent: SmartFolderIntentHint | None = None
    reason: str = ""
    suggested_title: str | None = None

    @model_validator(mode="after")
    def _require_matching_intent(self) -> ChatRouteResponse:
        if self.intent == "create" and self.create_intent is None:
            raise ValueError("create_intent is required when intent='create'")
        elif self.intent == "edit" and self.edit_intent is None:
            raise ValueError("edit_intent is required when intent='edit'")
        elif self.intent == "smart_folder" and self.smart_folder_intent is None:
            raise ValueError("smart_folder_intent is required when intent='smart_folder'")
        return self
