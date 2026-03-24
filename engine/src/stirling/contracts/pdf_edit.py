from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models.base import ApiModel
from stirling.models.tool_models import OperationId, ParamToolModel


class PdfEditRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)


class EditOperationPlanStep(ApiModel):
    tool: OperationId
    parameters: ParamToolModel
    rationale: str | None = None


class EditPlanResponse(ApiModel):
    outcome: Literal["plan"] = "plan"
    summary: str
    steps: list[EditOperationPlanStep]


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
