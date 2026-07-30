"""DocParse routes: parse, tables, rag-ingest, capabilities.

Tier routing: requests carrying raw file bytes can use the advanced (Docling)
path when the addon is installed; text-only requests run the basic path.
Forcing ``advanced`` without the addon returns 501 with a machine-readable
``addonRequired`` detail that Java maps onto its own error.
"""

from __future__ import annotations

import base64
import binascii
import logging
from typing import Annotated

import anyio.to_thread
from fastapi import APIRouter, Depends, HTTPException, status

from stirling.api.dependencies import (
    get_document_service,
    get_extract_fields_agent,
    get_suggest_schema_agent,
    require_user_id,
)
from stirling.config import AppSettings, load_settings
from stirling.contracts.docparse import (
    DocChunk,
    DocparseCapabilities,
    DocparseMode,
    DocparseTier,
    ExtractFieldsRequest,
    ExtractFieldsResponse,
    ExtractTablesRequest,
    ExtractTablesResponse,
    ParseDocumentRequest,
    ParseDocumentResponse,
    RagIngestRequest,
    RagIngestResponse,
    SuggestSchemaRequest,
    SuggestSchemaResponse,
)
from stirling.docparse import basic_chunks, probe_capabilities
from stirling.docparse.capability import models_dir
from stirling.docparse.chunking import advanced_chunks
from stirling.docparse.extractor import ExtractFieldsAgent, SchemaError, pages_from_parse
from stirling.docparse.suggest_schema import SuggestSchemaAgent
from stirling.documents import DocumentService
from stirling.documents.service import CONTENT_TYPE_METADATA_KEY, DOCPARSE_CHUNK_CONTENT_TYPE
from stirling.models import OwnerId, PrincipalId, UserId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/docparse", tags=["docparse"])

_ADDON_REQUIRED_DETAIL = {
    "addonRequired": "docparse",
    "message": "The docparse addon (Docling) is not installed on the engine. "
    "Install the engine's 'docparse' extra or enable DOCPARSE_AUTO_INSTALL.",
}


def _settings() -> AppSettings:
    return load_settings()


def _capabilities(settings: AppSettings, *, refresh: bool = False) -> DocparseCapabilities:
    return probe_capabilities(settings.docparse_home, refresh=refresh)


def _require_advanced(settings: AppSettings) -> str | None:
    caps = _capabilities(settings)
    if not caps.advanced_installed:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_ADDON_REQUIRED_DETAIL)
    directory = models_dir(settings.docparse_home)
    return str(directory) if caps.models_available and directory is not None else None


def _decode_content(content_base64: str) -> bytes:
    try:
        return base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="contentBase64 is not valid base64"
        ) from error


async def _parse_advanced(content_base64: str, file_name: str, *, with_ocr: bool, artifacts: str | None):
    """Run the Docling parse off-thread; unparsable documents are a caller error."""
    from stirling.docparse.parser import parse_pdf_bytes  # deferred: touches docling

    data = _decode_content(content_base64)
    try:
        return await anyio.to_thread.run_sync(
            lambda: parse_pdf_bytes(data, file_name, with_ocr=with_ocr, artifacts_path=artifacts)
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error


@router.get("/capabilities", response_model=DocparseCapabilities)
async def capabilities(refresh: bool = False) -> DocparseCapabilities:
    return _capabilities(_settings(), refresh=refresh)


@router.post("/parse", response_model=ParseDocumentResponse)
async def parse_document(request: ParseDocumentRequest) -> ParseDocumentResponse:
    """Advanced-tier layout parse. The basic tier lives Java-side (PDFBox) and
    never reaches the engine, so this endpoint requires the addon outright."""
    settings = _settings()
    artifacts = _require_advanced(settings)
    return await _parse_advanced(
        request.content_base64, request.file_name, with_ocr=request.with_ocr, artifacts=artifacts
    )


@router.post("/extract", response_model=ExtractFieldsResponse)
async def extract_fields(
    request: ExtractFieldsRequest,
    agent: Annotated[ExtractFieldsAgent, Depends(get_extract_fields_agent)],
) -> ExtractFieldsResponse:
    settings = _settings()
    caps = _capabilities(settings)

    use_advanced = request.mode is DocparseMode.ADVANCED or (
        request.mode is DocparseMode.AUTO and caps.advanced_installed and request.content_base64 is not None
    )
    parse = None
    if use_advanced:
        artifacts = _require_advanced(settings)
        if request.content_base64 is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="advanced extraction needs contentBase64 (the raw file)",
            )
        parse = await _parse_advanced(request.content_base64, request.file_name, with_ocr=True, artifacts=artifacts)

    pages = request.pages or (pages_from_parse(parse) if parse is not None else None)
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="send pages (extracted text) or contentBase64 with the addon installed",
        )
    try:
        return await agent.extract(request, pages, parse)
    except SchemaError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error


@router.post("/suggest-schema", response_model=SuggestSchemaResponse)
async def suggest_schema(
    request: SuggestSchemaRequest,
    agent: Annotated[SuggestSchemaAgent, Depends(get_suggest_schema_agent)],
) -> SuggestSchemaResponse:
    """Propose an extraction schema from the document's first pages.
    Tier routing: pages -> basic; contentBase64 + addon -> advanced parse."""
    settings = _settings()
    caps = _capabilities(settings)
    pages = request.pages
    tier = DocparseTier.BASIC
    if not pages and request.content_base64 is not None and caps.advanced_installed:
        artifacts = _require_advanced(settings)
        parse = await _parse_advanced(request.content_base64, request.file_name, with_ocr=True, artifacts=artifacts)
        pages = pages_from_parse(parse)
        tier = DocparseTier.ADVANCED
    if not pages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="send pages (extracted text) or contentBase64 with the addon installed",
        )
    return await agent.suggest(request, pages, tier)


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
    caps = _capabilities(settings)
    chunk_size = request.chunk_size if request.chunk_size is not None else settings.rag_chunk_size
    overlap = request.overlap if request.overlap is not None else settings.rag_chunk_overlap

    if not request.index and not request.include_markdown and not request.include_chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="nothing to do: enable index, includeMarkdown, or includeChunks",
        )

    use_advanced = request.mode is DocparseMode.ADVANCED or (
        request.mode is DocparseMode.AUTO and caps.advanced_installed and request.content_base64 is not None
    )
    if use_advanced:
        artifacts = _require_advanced(settings)
        if request.content_base64 is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="advanced chunking needs contentBase64 (the raw file)",
            )
        parse = await _parse_advanced(request.content_base64, request.file_name, with_ocr=True, artifacts=artifacts)
        chunked = advanced_chunks(parse, chunk_size, overlap)
        page_count = parse.pages
        markdown = parse.markdown if request.include_markdown else None
    else:
        if not request.pages:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="send pages (extracted text) or contentBase64 with the addon installed",
            )
        chunked = basic_chunks(request.pages, chunk_size, overlap)
        page_count = max(p.page_number for p in request.pages)
        markdown = None
        if request.include_markdown:
            markdown = "\n\n".join(p.text for p in request.pages if p.text.strip())

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


@router.post("/tables", response_model=ExtractTablesResponse)
async def extract_tables(request: ExtractTablesRequest) -> ExtractTablesResponse:
    settings = _settings()
    artifacts = _require_advanced(settings)
    parse = await _parse_advanced(request.content_base64, request.file_name, with_ocr=True, artifacts=artifacts)
    return ExtractTablesResponse(mode=parse.mode, tables=parse.tables)
