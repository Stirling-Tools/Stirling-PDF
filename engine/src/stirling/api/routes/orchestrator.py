from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_orchestrator_service
from stirling.contracts import OrchestratorRequest, OrchestratorResponse
from stirling.services.capabilities import OrchestratorService

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])


@router.post("", response_model=OrchestratorResponse)
async def orchestrate(
    request: OrchestratorRequest,
    service: Annotated[OrchestratorService, Depends(get_orchestrator_service)],
) -> OrchestratorResponse:
    return await service.handle(request)
