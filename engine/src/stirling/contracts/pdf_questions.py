from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import (
    ConversationMessage,
    ExtractedFileText,
    PdfContentType,
    SupportedCapability,
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


class NeedContentFileRequest(ApiModel):
    file_name: str
    page_numbers: list[int] = Field(default_factory=list)
    content_types: list[PdfContentType]


class PdfQuestionNeedContentResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NEED_CONTENT] = WorkflowOutcome.NEED_CONTENT
    resume_with: SupportedCapability = SupportedCapability.PDF_QUESTION
    reason: str
    files: list[NeedContentFileRequest] = Field(default_factory=list)
    max_pages: int
    max_characters: int


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NOT_FOUND] = WorkflowOutcome.NOT_FOUND
    reason: str


PdfQuestionResponse = Annotated[
    PdfQuestionAnswerResponse | PdfQuestionNeedContentResponse | PdfQuestionNotFoundResponse,
    Field(discriminator="outcome"),
]
