from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import ExecutionPlanningAgent
from stirling.api.dependencies import get_execution_planning_agent, get_tracking
from stirling.contracts import AgentExecutionRequest, NextExecutionAction
from stirling.services import TrackingService

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/next-action", response_model=NextExecutionAction)
async def next_action(
    request: AgentExecutionRequest,
    agent: Annotated[ExecutionPlanningAgent, Depends(get_execution_planning_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> NextExecutionAction:
    with tracking.timed_event("engine_next_action"):
        response = await agent.next_action(request)
    return response
