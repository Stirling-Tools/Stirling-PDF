"""Wire contracts for the DocParse ingestion capability.

Java counterpart DTOs live under ``stirling.software.proprietary.model.docparse``
(and ``stirling.software.common.pdf.MarkdownBlock``) and must stay in sync. Java
converts the PDF to page-attributed Markdown blocks; the engine packs those into
chunks, embeds and indexes them.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from stirling.models import ApiModel, FileId, OwnerId, PrincipalId


class MarkdownBlock(ApiModel):
    """One rendered Markdown element and the 1-based pages it came from.

    ``page_start`` and ``page_end`` differ only for content the converter stitched
    across a page break. ``heading_path`` is the enclosing heading chain, root first,
    with a heading block including itself.
    """

    markdown: str
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    heading_path: list[str] = Field(default_factory=list)


class DocChunk(ApiModel):
    index: int = Field(ge=0)
    text: str
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)
    heading_path: list[str] = Field(default_factory=list)


class IngestRequest(ApiModel):
    """Pack the caller's Markdown blocks into chunks, then optionally embed and index.

    ``owner_id``/``read_principals`` default to the calling user (personal-doc
    semantics); ``chunk_size``/``overlap`` default to the engine's RAG settings.
    ``index=False`` skips the store entirely; ``include_chunks`` returns the chunks
    so the caller can emit a corpus file.
    """

    document_id: FileId = Field(min_length=1)
    source: str = Field(default="docparse", min_length=1)
    owner_id: OwnerId | None = None
    read_principals: list[PrincipalId] | None = Field(default=None, min_length=1)
    expires_at: datetime | None = None
    blocks: list[MarkdownBlock] = Field(default_factory=list)
    chunk_size: int | None = Field(default=None, ge=64, le=32_768)
    overlap: int | None = Field(default=None, ge=0, le=4_096)
    index: bool = True
    include_chunks: bool = False


class IngestResponse(ApiModel):
    document_id: FileId
    chunks_indexed: int = Field(ge=0)
    chunks: list[DocChunk] | None = None
