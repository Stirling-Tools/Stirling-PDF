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


def _collection_for(document_id: str) -> str:
    """Map a document_id to its RAG collection name.

    Kept as a single-source helper so a future scoping scheme
    (``tenant:{t}:doc:{d}``) can be introduced in one place.
    """
    return document_id


@router.post("/documents", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``document_id``.

    Any previously-stored content for this document is removed and the
    provided content replaces it wholesale.
    """
    collection = _collection_for(request.document_id)
    await rag.delete_collection(collection)

    total = 0
    if request.page_text:
        source = request.source or request.document_id
        for page in request.page_text:
            if not page.text.strip():
                continue
            chunks = await rag.index_text(
                collection=collection,
                text=page.text,
                source=f"{source}:page:{page.page_number}",
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
    collection = _collection_for(document_id)
    existed = await rag.has_collection(collection)
    if existed:
        await rag.delete_collection(collection)
    return DeleteDocumentResponse(document_id=document_id, deleted=existed)
