from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_pdf_edit_service
from stirling.contracts import PdfEditRequest, PdfEditResponse
from stirling.services.capabilities import PdfEditService

router = APIRouter(prefix="/api/v1/pdf/edit", tags=["pdf-edit"])


@router.post("", response_model=PdfEditResponse)
async def pdf_edit(
    request: PdfEditRequest,
    service: Annotated[PdfEditService, Depends(get_pdf_edit_service)],
) -> PdfEditResponse:
    return await service.handle(request)
