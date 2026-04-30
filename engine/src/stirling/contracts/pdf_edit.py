from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field

from stirling.models import ApiModel, ToolEndpoint

from .common import (
    ConversationMessage,
    ExtractedFileText,
    NeedContentResponse,
    ToolOperationStep,
    WorkflowOutcome,
    drop_unknown_tool_endpoints,
)


class PdfEditRequest(ApiModel):
    user_message: str
    file_names: list[str] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    page_text: list[ExtractedFileText] = Field(default_factory=list)
    # The set of endpoints the Java backend considers usable. Unknown URLs are silently
    # dropped so the engine and Java can drift in either direction without breaking
    # validation. An empty list means no operations are available - the planner will
    # return `cannot_do`.
    enabled_endpoints: Annotated[list[ToolEndpoint], BeforeValidator(drop_unknown_tool_endpoints)] = Field(
        default_factory=list
    )


class EditPlanResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.PLAN] = WorkflowOutcome.PLAN
    summary: str
    rationale: str | None = None
    steps: list[ToolOperationStep]


class EditClarificationRequest(ApiModel):
    outcome: Literal[WorkflowOutcome.NEED_CLARIFICATION] = WorkflowOutcome.NEED_CLARIFICATION
    question: str
    reason: str


class EditCannotDoResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.CANNOT_DO] = WorkflowOutcome.CANNOT_DO
    reason: str


type PdfEditTerminalResponse = EditPlanResponse | EditClarificationRequest | EditCannotDoResponse
type PdfEditResponse = Annotated[
    PdfEditTerminalResponse | NeedContentResponse,
    Field(discriminator="outcome"),
]
