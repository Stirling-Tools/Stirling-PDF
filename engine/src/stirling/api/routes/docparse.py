"""DocParse ingestion routes: capabilities and rag-ingest.

The basic tier chunks caller-extracted page text. Requests forcing the
advanced (layout) tier return 501 with a machine-readable ``addonRequired``
detail until the docparse addon ships; Java maps that onto its own error.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from stirling.api.dependencies import get_document_service, require_user_id
from stirling.config import AppSettings, load_settings
from stirling.contracts.docparse import (
    DocChunk,
    DocparseCapabilities,
    DocparseMode,
    RagIngestRequest,
    RagIngestResponse,
)
from stirling.docparse import basic_chunks, probe_capabilities
from stirling.documents import DocumentService
from stirling.documents.service import CONTENT_TYPE_METADATA_KEY, DOCPARSE_CHUNK_CONTENT_TYPE
from stirling.models import OwnerId, PrincipalId, UserId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/docparse", tags=["docparse"])

_ADDON_REQUIRED_DETAIL = {
    "addonRequired": "docparse",
    "message": "The docparse addon (Docling) is not installed on the engine. "
    "The advanced tier is unavailable; use mode=basic or mode=auto.",
}


def _settings() -> AppSettings:
    return load_settings()


@router.get("/capabilities", response_model=DocparseCapabilities)
async def capabilities(refresh: bool = False) -> DocparseCapabilities:
    return probe_capabilities(_settings().docparse_home, refresh=refresh)


def _chunk_metadata(chunk: DocChunk) -> dict[str, str]:
    meta = {CONTENT_TYPE_METADATA_KEY: DOCPARSE_CHUNK_CONTENT_TYPE}
    if chunk.page_start is not None:
        meta["page_start"] = str(chunk.page_start)
    if chunk.page_end is not None:
        meta["page_end"] = str(chunk.page_end)
    if chunk.heading_path:
        meta["heading_path"] = " > ".join(chunk.heading_path)
    return meta


@router.post("/rag-ingest", response_model=RagIngestResponse)
async def rag_ingest(
    request: RagIngestRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> RagIngestResponse:
    """Chunk the document, then embed and index into the document store.
    Re-ingesting a documentId replaces its stored content (never duplicates).
    ``index=False`` skips the store; ``includeMarkdown``/``includeChunks``
    echo the content back for corpus export."""
    settings = _settings()
    chunk_size = request.chunk_size if request.chunk_size is not None else settings.rag_chunk_size
    overlap = request.overlap if request.overlap is not None else settings.rag_chunk_overlap

    if request.mode is DocparseMode.ADVANCED:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_ADDON_REQUIRED_DETAIL)
    if not request.pages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="send pages (extracted text); the advanced tier needs the docparse addon",
        )
    if not request.index and not request.include_markdown and not request.include_chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="nothing to do: enable index, includeMarkdown, or includeChunks",
        )

    chunked = basic_chunks(request.pages, chunk_size, overlap)
    page_count = max(p.page_number for p in request.pages)

    chunks_indexed = 0
    if request.index:
        # Owner/ACL semantics mirror IngestDocumentRequest; omitted values default
        # to the authenticated caller (personal-doc behaviour).
        owner_id = request.owner_id if request.owner_id is not None else OwnerId(user_id)
        read_principals = request.read_principals or [PrincipalId(owner_id)]
        chunks_indexed = await documents.ingest_prepared(
            collection=request.document_id,
            chunks=[(chunk.text, _chunk_metadata(chunk)) for chunk in chunked.chunks],
            source=request.source,
            owner_id=owner_id,
            read_principals=read_principals,
            expires_at=request.expires_at,
        )

    markdown = None
    if request.include_markdown:
        markdown = "\n\n".join(p.text for p in request.pages if p.text.strip())

    logger.info(
        "docparse: rag-ingested %s: %d chunks indexed, %d pages", request.document_id, chunks_indexed, page_count
    )
    return RagIngestResponse(
        mode=chunked.mode,
        document_id=request.document_id,
        chunks_indexed=chunks_indexed,
        pages=page_count,
        markdown=markdown,
        chunks=chunked.chunks if request.include_chunks else None,
    )
