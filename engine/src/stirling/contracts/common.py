from __future__ import annotations

from typing import Literal

from pydantic import model_validator

from stirling.models import OPERATIONS, ApiModel, OperationId, ParamToolModel


class ConversationMessage(ApiModel):
    role: str
    content: str


class PdfTextSelection(ApiModel):
    page_number: int | None = None
    text: str


class ToolOperationStep(ApiModel):
    kind: Literal["tool"] = "tool"
    tool: OperationId
    parameters: ParamToolModel

    @model_validator(mode="after")
    def validate_tool_parameter_pairing(self) -> ToolOperationStep:
        expected_type = OPERATIONS[self.tool]
        if not isinstance(self.parameters, expected_type):
            actual_type = type(self.parameters).__name__
            expected_type_name = expected_type.__name__
            raise ValueError(f"Parameters for tool {self.tool.value} must be {expected_type_name}, got {actual_type}.")
        return self
