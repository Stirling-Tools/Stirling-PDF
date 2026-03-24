from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents.user_spec import UserSpecAgent
from stirling.api.dependencies import get_user_spec_agent
from stirling.contracts import AgentDraftRequest, AgentDraftResponse, AgentRevisionRequest, AgentRevisionResponse

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/draft", response_model=AgentDraftResponse)
async def draft_agent(
    request: AgentDraftRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
) -> AgentDraftResponse:
    return await agent.draft(request)


@router.post("/revise", response_model=AgentRevisionResponse)
async def revise_agent(
    request: AgentRevisionRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
) -> AgentRevisionResponse:
    return await agent.revise(request)
