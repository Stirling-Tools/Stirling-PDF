from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from ..base import ApiModel
from ..chat import EditIntentHint
from ..common import ErrorCode
from ..tool_models import OperationId, ParamToolModel


class EditSessionResponse(ApiModel):
    session_id: str
    file_name: str
    file_type: str | None = None


class EditMessageRequest(ApiModel):
    message: str = ""
    action: str | None = None
    edit_intent: EditIntentHint | None = None


class EditToolCall(ApiModel):
    operation_id: OperationId
    parameters: ParamToolModel


class EditResultFile(ApiModel):
    url: str
    name: str | None = None


class FrontendExecutionStep(ApiModel):
    operation_id: OperationId
    parameters: ParamToolModel


class FrontendExecutionPlan(ApiModel):
    mode: Literal["single", "pipeline"]
    steps: list[FrontendExecutionStep] = Field(default_factory=list)
    pipeline_name: str | None = None


class EditMessageResponse(ApiModel):
    assistant_message: str
    tool_calls: list[EditToolCall] = Field(default_factory=list)
    execute_on_frontend: bool = False
    frontend_plan: FrontendExecutionPlan | None = None
    result_file_url: str | None = None
    result_file_name: str | None = None
    result_files: list[EditResultFile] | None = None
    result_json: dict[str, Any] | None = None
    result_text: str | None = None
    result_bool: bool | None = None
    needs_more_info: bool = False
    missing_parameters: list[str] = Field(default_factory=list)
    confirmation_required: bool = False
    warning: str | None = None
    error: ErrorCode | None = None
