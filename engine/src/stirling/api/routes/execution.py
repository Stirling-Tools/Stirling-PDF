from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_agent_execution_planning_service
from stirling.contracts import AgentExecutionRequest, NextExecutionAction
from stirling.services.capabilities import AgentExecutionPlanningService

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/next-action", response_model=NextExecutionAction)
async def next_action(
    request: AgentExecutionRequest,
    service: Annotated[AgentExecutionPlanningService, Depends(get_agent_execution_planning_service)],
) -> NextExecutionAction:
    return await service.next_action(request)
