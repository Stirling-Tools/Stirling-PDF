from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_rag_service
from stirling.contracts import (
    DeleteDocumentResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
    PdfContentType,
)
from stirling.rag import RagService

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


@router.post("/documents", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``document_id``.

    Any previously-stored content for this document is removed and the
    provided content replaces it wholesale.
    """
    await rag.delete_collection(request.document_id)

    total = 0
    if request.page_text:
        for page in request.page_text:
            if not page.text.strip():
                continue
            chunks = await rag.index_text(
                collection=request.document_id,
                text=page.text,
                source=f"{request.source}:page:{page.page_number}",
                metadata={
                    "page_number": str(page.page_number),
                    "content_type": PdfContentType.PAGE_TEXT.value,
                },
            )
            total += chunks

    return IngestDocumentResponse(document_id=request.document_id, chunks_indexed=total)


@router.delete("/documents/{document_id}", response_model=DeleteDocumentResponse)
async def delete_document(
    document_id: str,
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> DeleteDocumentResponse:
    """Remove a document's content from RAG. Idempotent."""
    existed = await rag.has_collection(document_id)
    if existed:
        await rag.delete_collection(document_id)
    return DeleteDocumentResponse(document_id=document_id, deleted=existed)
