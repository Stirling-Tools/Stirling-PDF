from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import PdfQuestionAgent
from stirling.api.dependencies import get_pdf_question_agent, get_tracking
from stirling.contracts import PdfQuestionRequest, PdfQuestionResponse
from stirling.services import TrackingService

router = APIRouter(prefix="/api/v1/pdf/questions", tags=["pdf-questions"])


@router.post("", response_model=PdfQuestionResponse)
async def pdf_questions(
    request: PdfQuestionRequest,
    agent: Annotated[PdfQuestionAgent, Depends(get_pdf_question_agent)],
    tracking: Annotated[TrackingService, Depends(get_tracking)],
) -> PdfQuestionResponse:
    with tracking.timed_event("engine_pdf_questions"):
        response = await agent.handle(request)
    return response
