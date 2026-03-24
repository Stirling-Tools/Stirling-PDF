from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from stirling.models.base import ApiModel
from stirling.models.tool_models import OPERATIONS, OperationId, ParamToolModel


class PdfEditRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)


class EditOperationPlanStep(ApiModel):
    tool: OperationId
    parameters: ParamToolModel

    @model_validator(mode="after")
    def validate_tool_parameter_pairing(self) -> EditOperationPlanStep:
        expected_type = OPERATIONS[self.tool]
        if not isinstance(self.parameters, expected_type):
            actual_type = type(self.parameters).__name__
            expected_type_name = expected_type.__name__
            raise ValueError(f"Parameters for tool {self.tool.value} must be {expected_type_name}, got {actual_type}.")
        return self


class EditPlanResponse(ApiModel):
    outcome: Literal["plan"] = "plan"
    summary: str
    rationale: str | None = None
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
