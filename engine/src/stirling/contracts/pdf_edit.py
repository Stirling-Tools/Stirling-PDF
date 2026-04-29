from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import (
    ConversationMessage,
    ExtractedFileText,
    NeedContentResponse,
    SupportedCapability,
    ToolOperationStep,
    WorkflowOutcome,
)


class PdfEditRequest(ApiModel):
    user_message: str
    file_names: list[str] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    page_text: list[ExtractedFileText] = Field(default_factory=list)


class EditPlanResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.PLAN] = WorkflowOutcome.PLAN
    summary: str
    rationale: str | None = None
    steps: list[ToolOperationStep]
    resume_with: SupportedCapability | None = Field(
        default=None,
        description=(
            "Optional: if set, Java runs the plan steps then re-invokes the orchestrator with"
            " the captured tool reports attached as ToolReportArtifacts and"
            " resume_with set to this capability. Used by meta-agents that need to digest a"
            " specialist's output (e.g. pdf_review consulting math-auditor)."
        ),
    )


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
