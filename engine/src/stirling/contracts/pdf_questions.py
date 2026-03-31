from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .common import PdfTextSelection, SupportedCapability


class PdfQuestionRequest(ApiModel):
    question: str
    page_text: list[PdfTextSelection] = Field(default_factory=list)
    file_name: str | None = None


class PdfQuestionAnswerResponse(ApiModel):
    outcome: Literal["answer"] = "answer"
    answer: str
    evidence: list[PdfTextSelection] = Field(default_factory=list)


class PdfQuestionNeedTextResponse(ApiModel):
    outcome: Literal["need_text"] = "need_text"
    resume_with: SupportedCapability = SupportedCapability.PDF_QUESTION
    reason: str
    page_numbers: list[int] = Field(default_factory=list)
    max_pages: int
    max_characters: int


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal["not_found"] = "not_found"
    reason: str


PdfQuestionResponse = Annotated[
    PdfQuestionAnswerResponse | PdfQuestionNeedTextResponse | PdfQuestionNotFoundResponse,
    Field(discriminator="outcome"),
]
