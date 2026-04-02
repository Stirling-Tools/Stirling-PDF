from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import ExtractedFileText, SupportedCapability, WorkflowOutcome


class PdfQuestionRequest(ApiModel):
    question: str
    page_text: list[ExtractedFileText] = Field(default_factory=list)
    file_names: list[str]


class PdfQuestionAnswerResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.ANSWER] = WorkflowOutcome.ANSWER
    answer: str
    evidence: list[ExtractedFileText] = Field(default_factory=list)


class NeedTextFileRequest(ApiModel):
    file_name: str
    page_numbers: list[int] = Field(default_factory=list)


class PdfQuestionNeedTextResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NEED_TEXT] = WorkflowOutcome.NEED_TEXT
    resume_with: SupportedCapability = SupportedCapability.PDF_QUESTION
    reason: str
    files: list[NeedTextFileRequest] = Field(default_factory=list)
    max_pages: int
    max_characters: int


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NOT_FOUND] = WorkflowOutcome.NOT_FOUND
    reason: str


PdfQuestionResponse = Annotated[
    PdfQuestionAnswerResponse | PdfQuestionNeedTextResponse | PdfQuestionNotFoundResponse,
    Field(discriminator="outcome"),
]
