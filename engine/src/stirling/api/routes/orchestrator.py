from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import OrchestratorAgent
from stirling.api.dependencies import get_orchestrator_agent
from stirling.contracts import OrchestratorRequest, OrchestratorResponse

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])


@router.post("", response_model=OrchestratorResponse)
async def orchestrate(
    request: OrchestratorRequest,
    agent: Annotated[OrchestratorAgent, Depends(get_orchestrator_agent)],
) -> OrchestratorResponse:
    return await agent.handle(request)
