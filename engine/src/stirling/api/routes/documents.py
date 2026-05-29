from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_document_service, require_user_id
from stirling.contracts import (
    DeleteDocumentResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
)
from stirling.documents import DocumentService
from stirling.models import FileId, UserId

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``document_id`` for the caller.

    Stores both representations in one shot:
      * embedded chunks for RAG search,
      * ordered page text for whole-document reading.
    Any previously-stored content for this document (under the same user) is
    removed first. The same ``document_id`` belonging to a different user is
    untouched.
    """
    pages = request.page_text or []
    chunks_indexed = await documents.ingest(
        collection=request.document_id,
        pages=pages,
        source=request.source,
        user_id=user_id,
    )
    return IngestDocumentResponse(document_id=request.document_id, chunks_indexed=chunks_indexed)


@router.delete("/{document_id}", response_model=DeleteDocumentResponse)
async def delete_document(
    document_id: FileId,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> DeleteDocumentResponse:
    """Remove the caller's copy of this document. Idempotent."""
    existed = await documents.has_collection(document_id, user_id)
    if existed:
        await documents.delete_collection(document_id, user_id)
    return DeleteDocumentResponse(document_id=document_id, deleted=existed)
