from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel


class IngestedPageText(ApiModel):
    page_number: int = Field(ge=1)
    text: str


class IngestDocumentRequest(ApiModel):
    """Replace-ingest a document's content into RAG under the given document_id.

    Each content-type field is optional; the endpoint replaces the document's entire
    stored content with whatever is provided. To add a content type later, call again
    with all content types the document should have (incremental-add-without-replace
    will be a separate endpoint if/when we need it).

    ``source`` is a human-readable label (typically the original filename) that flows
    into chunk metadata so search results are readable when document_id is a hash.
    """

    document_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    page_text: list[IngestedPageText] | None = None


class IngestDocumentResponse(ApiModel):
    document_id: str
    chunks_indexed: int


class DeleteDocumentResponse(ApiModel):
    document_id: str
    deleted: bool
