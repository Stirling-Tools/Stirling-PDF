from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ConversationMessage, ToolOperationStep, WorkflowOutcome


class PdfEditRequest(ApiModel):
    user_message: str
    file_names: list[str] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


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


PdfEditResponse = Annotated[
    EditPlanResponse | EditClarificationRequest | EditCannotDoResponse,
    Field(discriminator="outcome"),
]
