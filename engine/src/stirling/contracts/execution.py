from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from stirling.models import ApiModel, ParamToolModel, ToolEndpoint

from .agent_specs import AgentSpec
from .common import WorkflowOutcome


class ExecutionStepResult(ApiModel):
    step_index: int
    tool: ToolEndpoint | None = None
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
    outcome: Literal[WorkflowOutcome.TOOL_CALL] = WorkflowOutcome.TOOL_CALL
    tool: ToolEndpoint
    parameters: ParamToolModel
    rationale: str | None = None


class CompletedExecutionAction(ApiModel):
    outcome: Literal[WorkflowOutcome.COMPLETED] = WorkflowOutcome.COMPLETED
    summary: str


class CannotContinueExecutionAction(ApiModel):
    outcome: Literal[WorkflowOutcome.CANNOT_CONTINUE] = WorkflowOutcome.CANNOT_CONTINUE
    reason: str


NextExecutionAction = Annotated[
    ToolCallExecutionAction | CompletedExecutionAction | CannotContinueExecutionAction,
    Field(discriminator="outcome"),
]
