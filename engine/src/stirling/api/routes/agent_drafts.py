from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_agent_draft_service
from stirling.contracts import AgentDraftRequest, AgentDraftResponse, AgentRevisionRequest, AgentRevisionResponse
from stirling.services.capabilities import AgentDraftService

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/draft", response_model=AgentDraftResponse)
async def draft_agent(
    request: AgentDraftRequest,
    service: Annotated[AgentDraftService, Depends(get_agent_draft_service)],
) -> AgentDraftResponse:
    return await service.draft(request)


@router.post("/revise", response_model=AgentRevisionResponse)
async def revise_agent(
    request: AgentRevisionRequest,
    service: Annotated[AgentDraftService, Depends(get_agent_draft_service)],
) -> AgentRevisionResponse:
    return await service.revise(request)
