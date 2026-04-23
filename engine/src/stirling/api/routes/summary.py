from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import SummaryAgent
from stirling.api.dependencies import get_summary_agent
from stirling.contracts import SummaryRequest, SummaryResponse

router = APIRouter(prefix="/api/v1/pdf/summary", tags=["pdf-summary"])


@router.post("", response_model=SummaryResponse)
async def pdf_summary(
    request: SummaryRequest,
    agent: Annotated[SummaryAgent, Depends(get_summary_agent)],
) -> SummaryResponse:
    return await agent.handle(request)
