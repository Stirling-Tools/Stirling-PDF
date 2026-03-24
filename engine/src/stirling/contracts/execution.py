from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from stirling.models.base import ApiModel
from stirling.models.tool_models import OperationId, ParamToolModel

from .agent_specs import AgentSpec


class ExecutionStepResult(ApiModel):
    step_index: int
    tool: OperationId | None = None
    success: bool
    output_summary: str | None = None
    output_data: dict[str, Any] = Field(default_factory=dict)


class ExecutionContext(ApiModel):
    trigger_type: str | None = None
    input_files: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentExecutionRequest(ApiModel):
    agent_spec: AgentSpec
    current_step_index: int
    execution_context: ExecutionContext
    previous_step_results: list[ExecutionStepResult] = Field(default_factory=list)


class ToolCallExecutionAction(ApiModel):
    outcome: Literal["tool_call"] = "tool_call"
    tool: OperationId
    parameters: ParamToolModel
    rationale: str | None = None


class CompletedExecutionAction(ApiModel):
    outcome: Literal["completed"] = "completed"
    summary: str


class CannotContinueExecutionAction(ApiModel):
    outcome: Literal["cannot_continue"] = "cannot_continue"
    reason: str


NextExecutionAction = Annotated[
    ToolCallExecutionAction | CompletedExecutionAction | CannotContinueExecutionAction,
    Field(discriminator="outcome"),
]
