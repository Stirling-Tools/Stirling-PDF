from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

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
    """Replace-ingest a document's content under the given ``document_id``.

    Each call wipes any previously-stored content for the document and writes
    both the vector-chunk and ordered-page representations from the supplied
    pages.

    ``source`` is a human-readable label (typically the original filename)
    that flows into chunk metadata so search results are readable when
    ``document_id`` is a hash.
    """

    document_id: FileId = Field(min_length=1)
    source: str = Field(min_length=1)
    page_text: list[PageText] | None = None


class IngestDocumentResponse(ApiModel):
    document_id: FileId
    chunks_indexed: int


class DeleteDocumentResponse(ApiModel):
    document_id: FileId
    deleted: bool
