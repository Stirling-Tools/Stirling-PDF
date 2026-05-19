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


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NOT_FOUND] = WorkflowOutcome.NOT_FOUND
    reason: str


type PdfQuestionTerminalResponse = PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse
type PdfQuestionResponse = Annotated[
    PdfQuestionTerminalResponse | NeedIngestResponse,
    Field(discriminator="outcome"),
]


# ``orchestrate`` may also emit an ``EditPlanResponse`` on the math-routing
# first turn (``outcome=PLAN`` with ``resume_with=PDF_QUESTION``). It's not in
# ``PdfQuestionTerminalResponse`` because that alias would otherwise duplicate
# the PLAN branch already provided by ``PdfEditTerminalResponse`` in the
# top-level :class:`OrchestratorResponse` discriminated union.
type PdfQuestionOrchestrateResponse = PdfQuestionResponse | EditPlanResponse
