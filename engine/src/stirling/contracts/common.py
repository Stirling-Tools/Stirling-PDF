from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field, model_validator

from stirling.models import OPERATIONS, ApiModel, OperationId, ParamToolModel


class SupportedCapability(StrEnum):
    ORCHESTRATE = "orchestrate"
    PDF_EDIT = "pdf_edit"
    PDF_QUESTION = "pdf_question"
    AGENT_DRAFT = "agent_draft"
    AGENT_REVISE = "agent_revise"
    AGENT_NEXT_ACTION = "agent_next_action"


class ConversationMessage(ApiModel):
    role: str
    content: str


class PdfTextSelection(ApiModel):
    page_number: int | None = None
    text: str


class ExtractedFileText(ApiModel):
    file_name: str
    pages: list[PdfTextSelection] = Field(default_factory=list)


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
