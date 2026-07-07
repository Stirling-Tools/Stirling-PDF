from __future__ import annotations

from stirling.agents._registry import AgentDescriptor, McpCapability, RegisterableAgent
from stirling.contracts import AgentExecutionRequest, CannotContinueExecutionAction, NextExecutionAction
from stirling.services import AppRuntime


class ExecutionPlanningAgent(RegisterableAgent):
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    def describe(self) -> AgentDescriptor:
        # MCP-only: an internal sub-agent the orchestrator never delegates to.
        return AgentDescriptor(
            mcp=(
                McpCapability(
                    id="agent-next-action",
                    description=(
                        "Decide the next execution step for an in-progress agent workflow. Returns a"
                        " ToolCall, Completed, or CannotContinue action."
                    ),
                    input_model=AgentExecutionRequest,
                    mode="sync",
                    required_scope="mcp.tools.read",
                    route="/api/v1/agents/next-action",
                ),
            ),
        )

    async def next_action(self, request: AgentExecutionRequest) -> NextExecutionAction:
        return CannotContinueExecutionAction(
            reason=f"Execution planning is not implemented yet for step {request.current_step_index}."
        )
