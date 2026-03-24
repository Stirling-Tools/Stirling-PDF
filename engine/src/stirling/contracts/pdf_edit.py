from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models.base import ApiModel

from .common import ToolOperationStep


class PdfEditRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)


class EditPlanResponse(ApiModel):
    outcome: Literal["plan"] = "plan"
    summary: str
    rationale: str | None = None
    steps: list[ToolOperationStep]


class EditClarificationRequest(ApiModel):
    outcome: Literal["need_clarification"] = "need_clarification"
    question: str
    reason: str


class EditCannotDoResponse(ApiModel):
    outcome: Literal["cannot_do"] = "cannot_do"
    reason: str


PdfEditResponse = Annotated[
    EditPlanResponse | EditClarificationRequest | EditCannotDoResponse,
    Field(discriminator="outcome"),
]
