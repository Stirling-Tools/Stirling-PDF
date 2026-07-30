"""Wire contracts for the DocParse ingestion capability (chunking + rag-ingest).

Java counterpart DTOs live under ``stirling.software.proprietary.model.docparse``
and must stay in sync. Tier model: ``basic`` (text layer) runs everywhere;
``advanced`` (layout parsing) arrives with the docparse addon.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from stirling.contracts.documents import PageText
from stirling.models import ApiModel, FileId, OwnerId, PrincipalId


class DocparseTier(StrEnum):
    """Which implementation actually served a request."""

    BASIC = "basic"
    ADVANCED = "advanced"


class DocparseMode(StrEnum):
    """What the caller asked for; AUTO resolves per-request."""

    AUTO = "auto"
    BASIC = "basic"
    ADVANCED = "advanced"


class DocChunk(ApiModel):
    index: int = Field(ge=0)
    text: str
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)
    heading_path: list[str] = Field(default_factory=list)


class ChunkDocumentResponse(ApiModel):
    mode: DocparseTier
    chunks: list[DocChunk] = Field(default_factory=list)


class RagIngestRequest(ApiModel):
    """Chunk the document, then optionally embed and replace-index it.

    ``owner_id``/``read_principals`` default to the calling user (personal-doc
    semantics); ``chunk_size``/``overlap`` default to the engine's RAG settings.
    ``index=False`` skips the store entirely (export-only ingestion);
    ``include_markdown``/``include_chunks`` echo the parsed content back so the
    caller can emit corpus files (markdown, chunks JSONL).
    """

    file_name: str = Field(min_length=1)
    document_id: FileId = Field(min_length=1)
    source: str = Field(default="docparse", min_length=1)
    owner_id: OwnerId | None = None
    read_principals: list[PrincipalId] | None = Field(default=None, min_length=1)
    expires_at: datetime | None = None
    pages: list[PageText] | None = None
    chunk_size: int | None = Field(default=None, ge=64, le=32_768)
    overlap: int | None = Field(default=None, ge=0, le=4_096)
    mode: DocparseMode = DocparseMode.AUTO
    index: bool = True
    include_markdown: bool = False
    include_chunks: bool = False


class RagIngestResponse(ApiModel):
    mode: DocparseTier
    document_id: FileId
    chunks_indexed: int = Field(ge=0)
    pages: int = Field(ge=0)
    markdown: str | None = None
    chunks: list[DocChunk] | None = None


class DocparseCapabilities(ApiModel):
    """What the engine can actually do right now; Java caches and republishes this."""

    advanced_installed: bool
    docling_version: str | None = None
    torch_version: str | None = None
    models_available: bool = False
    models_path: str | None = None
    errors: list[str] = Field(default_factory=list)
