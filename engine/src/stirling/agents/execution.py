from __future__ import annotations

from stirling.contracts import AgentExecutionRequest, CannotContinueExecutionAction, NextExecutionAction
from stirling.services import AppRuntime


class ExecutionPlanningAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def next_action(self, request: AgentExecutionRequest) -> NextExecutionAction:
        return CannotContinueExecutionAction(
            reason=f"Execution planning is not implemented yet for step {request.current_step_index}."
        )
