from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import (
    AiFile,
    ConversationMessage,
    ExtractedFileText,
    NeedIngestResponse,
    WorkflowOutcome,
)
from .pdf_edit import EditPlanResponse


class PdfQuestionRequest(ApiModel):
    question: str
    files: list[AiFile] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class PdfQuestionAnswerResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.ANSWER] = WorkflowOutcome.ANSWER
    answer: str
    evidence: list[ExtractedFileText] = Field(default_factory=list)
    edit_plan: EditPlanResponse | None = Field(
        default=None,
        description=(
            "Optional plan the caller must run before the answer is final. When"
            " populated, ``answer`` is empty on this turn — the caller executes"
            " the plan and re-invokes the orchestrator with ``resume_with`` set"
            " to PDF_QUESTION; the real answer arrives on the resume turn."
        ),
    )


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NOT_FOUND] = WorkflowOutcome.NOT_FOUND
    reason: str


type PdfQuestionTerminalResponse = PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse
type PdfQuestionResponse = Annotated[
    PdfQuestionTerminalResponse | NeedIngestResponse,
    Field(discriminator="outcome"),
]
