from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field

from stirling.models import ApiModel, ToolEndpoint

from .common import (
    AiFile,
    ConversationMessage,
    ExtractedFileText,
    NeedContentResponse,
    SupportedCapability,
    ToolOperationStep,
    WorkflowOutcome,
    drop_unknown_tool_endpoints,
)


class PdfEditRequest(ApiModel):
    user_message: str
    files: list[AiFile] = Field(default_factory=list)
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
