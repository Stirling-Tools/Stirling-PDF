from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import UserSpecAgent
from stirling.api.dependencies import get_tracking, get_user_spec_agent
from stirling.contracts import (
    AgentDraftRequest,
    AgentDraftWorkflowResponse,
    AgentRevisionRequest,
    AgentRevisionWorkflowResponse,
)
from stirling.services import TrackingService

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.post("/draft", response_model=AgentDraftWorkflowResponse)
async def draft_agent(
    request: AgentDraftRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> AgentDraftWorkflowResponse:
    with tracking.timed_event("engine_agent_draft"):
        response = await agent.draft(request)
    return response


@router.post("/revise", response_model=AgentRevisionWorkflowResponse)
async def revise_agent(
    request: AgentRevisionRequest,
    agent: Annotated[UserSpecAgent, Depends(get_user_spec_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> AgentRevisionWorkflowResponse:
    with tracking.timed_event("engine_agent_revise"):
        response = await agent.revise(request)
    return response
