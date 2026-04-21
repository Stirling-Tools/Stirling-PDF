from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import (
    ConversationMessage,
    ExtractedFileText,
    NeedContentResponse,
    WorkflowOutcome,
)


class PdfQuestionRequest(ApiModel):
    question: str
    page_text: list[ExtractedFileText] = Field(default_factory=list)
    file_names: list[str]
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class PdfQuestionAnswerResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.ANSWER] = WorkflowOutcome.ANSWER
    answer: str
    evidence: list[ExtractedFileText] = Field(default_factory=list)


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NOT_FOUND] = WorkflowOutcome.NOT_FOUND
    reason: str


PdfQuestionResponse = Annotated[
    PdfQuestionAnswerResponse | NeedContentResponse | PdfQuestionNotFoundResponse,
    Field(discriminator="outcome"),
]
