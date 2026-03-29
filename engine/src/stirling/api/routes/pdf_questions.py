from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import PdfQuestionAgent
from stirling.api.dependencies import get_pdf_question_agent
from stirling.contracts import PdfQuestionRequest, PdfQuestionResponse

router = APIRouter(prefix="/api/v1/pdf/questions", tags=["pdf-questions"])


@router.post("", response_model=PdfQuestionResponse)
async def pdf_questions(
    request: PdfQuestionRequest,
    agent: Annotated[PdfQuestionAgent, Depends(get_pdf_question_agent)],
) -> PdfQuestionResponse:
    return await agent.handle(request)
