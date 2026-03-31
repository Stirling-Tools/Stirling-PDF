from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import OrchestratorAgent
from stirling.api.dependencies import get_orchestrator_agent, get_tracking
from stirling.contracts import OrchestratorRequest, OrchestratorResponse
from stirling.services import TrackingService

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])


@router.post("", response_model=OrchestratorResponse)
async def orchestrate(
    request: OrchestratorRequest,
    agent: Annotated[OrchestratorAgent, Depends(get_orchestrator_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> OrchestratorResponse:
    with tracking.timed_event("engine_orchestrate"):
        response = await agent.handle(request)
    return response
