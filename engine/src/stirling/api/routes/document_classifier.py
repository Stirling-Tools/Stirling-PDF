from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import DocumentClassifierAgent
from stirling.api.dependencies import get_document_classifier_agent
from stirling.contracts import ClassifyDocumentRequest, ClassifyDocumentResponse

router = APIRouter(prefix="/api/v1/documents/classify", tags=["document-classifier"])


@router.post("", response_model=ClassifyDocumentResponse)
async def classify_document(
    request: ClassifyDocumentRequest,
    agent: Annotated[DocumentClassifierAgent, Depends(get_document_classifier_agent)],
) -> ClassifyDocumentResponse:
    """Classify a document from its supplied page text against the default taxonomy.

    The caller sends the bounded page window inline, so no per-user document
    storage is touched here — the request is self-contained.
    """
    return await agent.classify(request)
