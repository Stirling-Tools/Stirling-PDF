from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import UserSpecAgent
from stirling.api.dependencies import get_user_spec_agent
from stirling.contracts import (
    AgentDraftRequest,
    AgentDraftWorkflowResponse,
    AgentRevisionRequest,
    AgentRevisionWorkflowResponse,
)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/draft", response_model=AgentDraftWorkflowResponse)
async def draft_agent(
    request: AgentDraftRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
) -> AgentDraftWorkflowResponse:
    return await agent.draft(request)


@router.post("/revise", response_model=AgentRevisionWorkflowResponse)
async def revise_agent(
    request: AgentRevisionRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
) -> AgentRevisionWorkflowResponse:
    return await agent.revise(request)
