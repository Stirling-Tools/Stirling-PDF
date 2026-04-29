from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents.pdf_to_markdown import PdfToMarkdownAgent
from stirling.api.dependencies import get_pdf_to_markdown_agent
from stirling.contracts.pdf_to_markdown import PdfToMarkdownRequest, PdfToMarkdownResponse

router = APIRouter(prefix="/api/v1/pdf/to-markdown", tags=["pdf-to-markdown"])


@router.post("", response_model=PdfToMarkdownResponse)
async def convert_pdf_to_markdown(
    request: PdfToMarkdownRequest,
    agent: Annotated[PdfToMarkdownAgent, Depends(get_pdf_to_markdown_agent)],
) -> PdfToMarkdownResponse:
    return await agent.handle(request)
