from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models.base import ApiModel


class PdfQuestionRequest(ApiModel):
    question: str
    conversation_id: str | None = None
    extracted_text: str = ""
    file_name: str | None = None


class PdfQuestionAnswerResponse(ApiModel):
    outcome: Literal["answer"] = "answer"
    answer: str
    evidence: list[str] = Field(default_factory=list)


class PdfQuestionNeedTextResponse(ApiModel):
    outcome: Literal["need_text"] = "need_text"
    reason: str


class PdfQuestionNotFoundResponse(ApiModel):
    outcome: Literal["not_found"] = "not_found"
    reason: str


PdfQuestionResponse = Annotated[
    PdfQuestionAnswerResponse | PdfQuestionNeedTextResponse | PdfQuestionNotFoundResponse,
    Field(discriminator="outcome"),
]
