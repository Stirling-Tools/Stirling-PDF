from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from .base import ApiModel
from .tool_models import OperationId, ParamToolModel

type JsonValue = dict[str, Any] | list[Any] | str | int | float | bool | None


class ToolParameter(ApiModel):
    name: str
    value: JsonValue


class EditToolSelection(ApiModel):
    action: Literal["call_tool", "ask_user", "no_tool"]
    operation_ids: list[OperationId] = Field(
        default_factory=list,
        description="Operation IDs to run in order. Use multiple items for compound requests.",
    )
    response_message: str | None = None


class ClarificationDecision(ApiModel):
    action: str = Field(..., description="proceed or ask_user")
    question: str | None = None
    missing_parameters: list[str] = Field(default_factory=list)


class FollowupIntent(ApiModel):
    mode: str = Field(..., description="fill_missing, new_request, or info")


class PendingRequirement(ApiModel):
    operation_id: OperationId
    parameters: ParamToolModel | None = None
    missing: list[str] = Field(default_factory=list)
