from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_document_service
from stirling.contracts import (
    DeleteDocumentResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
)
from stirling.documents import DocumentService
from stirling.models import FileId

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


@router.post("/documents", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``document_id``.

    Stores both representations in one shot:
      * embedded chunks for RAG search,
      * ordered page text for whole-document reading.
    Any previously-stored content for this document is removed first.
    """
    pages = request.page_text or []
    chunks_indexed = await documents.ingest(
        collection=request.document_id,
        pages=pages,
        source=request.source,
    )
    return IngestDocumentResponse(document_id=request.document_id, chunks_indexed=chunks_indexed)


@router.delete("/documents/{document_id}", response_model=DeleteDocumentResponse)
async def delete_document(
    document_id: FileId,
    documents: Annotated[DocumentService, Depends(get_document_service)],
) -> DeleteDocumentResponse:
    """Remove a document's content. Idempotent."""
    existed = await documents.has_collection(document_id)
    if existed:
        await documents.delete_collection(document_id)
    return DeleteDocumentResponse(document_id=document_id, deleted=existed)
