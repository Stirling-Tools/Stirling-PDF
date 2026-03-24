from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_pdf_question_service
from stirling.contracts import PdfQuestionRequest, PdfQuestionResponse
from stirling.services.capabilities import PdfQuestionService

router = APIRouter(prefix="/api/v1/pdf/questions", tags=["pdf-questions"])


@router.post("", response_model=PdfQuestionResponse)
async def pdf_questions(
    request: PdfQuestionRequest,
    service: Annotated[PdfQuestionService, Depends(get_pdf_question_service)],
) -> PdfQuestionResponse:
    return await service.handle(request)
