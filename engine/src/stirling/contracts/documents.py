from __future__ import annotations

from datetime import datetime

from pydantic import Field

from stirling.models import ApiModel, OwnerId, PrincipalId

from .common import FileId


class PageText(ApiModel):
    """A single page of extracted text on the ingest wire."""

    page_number: int = Field(ge=1)
    text: str


class Page(ApiModel):
    """A single page of a document, retrieved from storage.

    ``char_count`` is precomputed at ingest time and reported here so callers
    can budget how much content they want to read without first concatenating
    the text of every page.
    """

    page_number: int = Field(ge=1)
    text: str
    char_count: int = Field(ge=0)


class PageRange(ApiModel):
    """Inclusive page range for partial reads. Both bounds are 1-indexed."""

    start: int = Field(ge=1)
    end: int = Field(ge=1)


class IngestDocumentRequest(ApiModel):
    """Replace-ingest a document's content under ``(document_id, owner_id)``.

    Each call wipes any previously-stored content for the pair and writes
    both the vector-chunk and ordered-page representations from the supplied
    pages.

    ``source`` is a human-readable label (typically the original filename)
    that flows into chunk metadata so search results are readable when
    ``document_id`` is a hash.

    ``owner_id`` and ``read_principals`` are required: the engine never
    defaults them. Callers must declare ownership and access explicitly.
    """

    document_id: FileId = Field(min_length=1)
    source: str = Field(min_length=1)
    page_text: list[PageText] | None = None
    owner_id: OwnerId = Field(min_length=1)
    read_principals: list[PrincipalId] = Field(min_length=1)
    # When to delete this doc. ``None`` means "persistent" (keep until an explicit delete)
    expires_at: datetime | None


class IngestDocumentResponse(ApiModel):
    document_id: FileId
    chunks_indexed: int


class DeleteDocumentResponse(ApiModel):
    document_id: FileId
    deleted: bool


class PurgeOwnerResponse(ApiModel):
    """Returned by ``DELETE /api/v1/documents/by-owner``."""

    owner_id: OwnerId
    deleted: int = Field(ge=0)


class DocumentStatsResponse(ApiModel):
    """Returned by ``GET /api/v1/documents/stats``. Deployment-wide counts
    (every owner's content) powering the admin dashboard."""

    backend: str
    documents: int = Field(ge=0)
    chunks: int = Field(ge=0)
    embedding_model: str


class DocumentSummary(ApiModel):
    """One stored document the caller can read: its id, source label, chunk count."""

    document_id: FileId
    source: str
    chunks: int = Field(ge=0)


class ListDocumentsResponse(ApiModel):
    """Returned by ``GET /api/v1/documents/list``. Caller-scoped rollup."""

    documents: list[DocumentSummary]


class SearchDocumentsRequest(ApiModel):
    """Semantic search over every document the caller can read."""

    query: str = Field(min_length=1)
    top_k: int = Field(default=8, ge=1, le=50)


class DocumentPassage(ApiModel):
    """A retrieved chunk on the wire. Page bounds and heading path come from
    chunk metadata when present (docparse chunks carry them); nulls otherwise."""

    document_id: FileId
    text: str
    score: float
    page_start: int | None = None
    page_end: int | None = None
    heading_path: list[str] = Field(default_factory=list)
    source: str | None = None


class SearchDocumentsResponse(ApiModel):
    passages: list[DocumentPassage]


class AskDocumentsRequest(ApiModel):
    """Question answered only from the caller's stored documents."""

    question: str = Field(min_length=1)
    top_k: int = Field(default=8, ge=1, le=20)


class AskDocumentsResponse(ApiModel):
    """Grounded answer with inline citations plus the passages it drew from."""

    answer: str
    passages: list[DocumentPassage]
