"""
PDF Comment Agent (pdfCommentAgent) — FastAPI routes.

One internal endpoint, called only by the Java PdfCommentAgentOrchestrator:

  POST /api/v1/ai/pdf-comment-agent/generate
      Java sends a PdfCommentRequest (prompt + positioned text chunks).
      Python returns a PdfCommentResponse listing which chunks to comment on.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents.pdf_comment import PdfCommentAgent
from stirling.api.dependencies import get_pdf_comment_agent
from stirling.contracts.pdf_comments import PdfCommentRequest, PdfCommentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai/pdf-comment-agent", tags=["pdf-comment-agent"])


@router.post("/generate", response_model=PdfCommentResponse)
async def generate_endpoint(
    request: PdfCommentRequest,
    agent: Annotated[PdfCommentAgent, Depends(get_pdf_comment_agent)],
) -> PdfCommentResponse:
    """Generate review comments for the supplied text chunks."""
    return await agent.generate(request)
