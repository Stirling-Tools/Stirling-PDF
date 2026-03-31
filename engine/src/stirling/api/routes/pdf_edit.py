from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import PdfEditAgent
from stirling.api.dependencies import get_pdf_edit_agent, get_tracking
from stirling.contracts import PdfEditRequest, PdfEditResponse
from stirling.services import TrackingService

router = APIRouter(prefix="/api/v1/pdf/edit", tags=["pdf-edit"])


@router.post("", response_model=PdfEditResponse)
async def pdf_edit(
    request: PdfEditRequest,
    agent: Annotated[PdfEditAgent, Depends(get_pdf_edit_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> PdfEditResponse:
    with tracking.timed_event("engine_pdf_edit"):
        response = await agent.handle(request)
    return response
