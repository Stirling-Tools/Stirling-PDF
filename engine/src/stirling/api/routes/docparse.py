"""DocParse ingestion route.

Java converts the PDF to page-attributed Markdown blocks with its layout-aware
converter; the engine packs those into chunks, embeds and indexes them.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from stirling.api.dependencies import get_document_service, require_user_id
from stirling.config import AppSettings, load_settings
from stirling.contracts.docparse import DocChunk, DocparseCapabilities, IngestRequest, IngestResponse
from stirling.docparse.chunking import pack_blocks, page_texts
from stirling.documents import DocumentService
from stirling.documents.service import CONTENT_TYPE_METADATA_KEY, DOCPARSE_CHUNK_CONTENT_TYPE
from stirling.models import OwnerId, PrincipalId, UserId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/docparse", tags=["docparse"])


def _settings() -> AppSettings:
    return load_settings()


@router.get("/capabilities", response_model=DocparseCapabilities)
async def capabilities(documents: Annotated[DocumentService, Depends(get_document_service)]) -> DocparseCapabilities:
    """Report live embedding readiness for guided ingestion setup."""
    return DocparseCapabilities(indexing_configured=documents.embedder.configured)


def _chunk_metadata(chunk: DocChunk) -> dict[str, str]:
    meta = {CONTENT_TYPE_METADATA_KEY: DOCPARSE_CHUNK_CONTENT_TYPE}
    if chunk.page_start is not None:
        meta["page_start"] = str(chunk.page_start)
    if chunk.page_end is not None:
        meta["page_end"] = str(chunk.page_end)
    if chunk.heading_path:
        meta["heading_path"] = " > ".join(chunk.heading_path)
    return meta


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    request: IngestRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> IngestResponse:
    """Pack the caller's Markdown blocks into chunks, then embed and index them.
    Re-ingesting a documentId replaces its stored content (never duplicates).
    ``index=False`` skips the store; ``includeChunks`` returns the chunks."""
    settings = _settings()
    chunk_size = request.chunk_size if request.chunk_size is not None else settings.rag_chunk_size
    overlap = request.overlap if request.overlap is not None else settings.rag_chunk_overlap

    if not request.blocks:
        # The caller converts the text layer, so an empty payload means the document
        # has none - a scan, not a conversion failure.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="no extractable text: the document has no text layer, so OCR it before ingesting",
        )
    if overlap >= chunk_size:
        # chunk_text derives its stride as chunk_size - overlap; a zero stride raises
        # and a negative one silently drops every over-long sentence.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"overlap ({overlap}) must be smaller than chunkSize ({chunk_size})",
        )
    if not request.index and not request.include_chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="nothing to do: enable index or includeChunks",
        )

    chunks = pack_blocks(request.blocks, chunk_size, overlap)

    chunks_indexed = 0
    if request.index:
        # Owner/ACL semantics mirror IngestDocumentRequest; omitted values default
        # to the authenticated caller (personal-doc behaviour).
        owner_id = request.owner_id if request.owner_id is not None else OwnerId(user_id)
        read_principals = request.read_principals or [PrincipalId(owner_id)]
        chunks_indexed = await documents.ingest_prepared(
            collection=request.document_id,
            chunks=[(chunk.text, _chunk_metadata(chunk)) for chunk in chunks],
            source=request.source,
            owner_id=owner_id,
            read_principals=read_principals,
            expires_at=request.expires_at,
            pages=page_texts(request.blocks),
        )

    logger.info("docparse: ingested %s: %d chunks indexed", request.document_id, chunks_indexed)
    return IngestResponse(
        document_id=request.document_id,
        chunks_indexed=chunks_indexed,
        chunks=chunks if request.include_chunks else None,
    )
