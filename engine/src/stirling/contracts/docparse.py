"""Wire contracts for the DocParse ingestion capability (chunking + rag-ingest).

Java counterpart DTOs live under ``stirling.software.proprietary.model.docparse``
and must stay in sync. Tier model: ``basic`` (text layer) runs everywhere;
``advanced`` (layout parsing) arrives with the docparse addon.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import Field, JsonValue

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


class BlockType(StrEnum):
    """Normalized layout block labels; Docling labels map onto these."""

    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"
    FIGURE = "figure"
    CAPTION = "caption"
    CODE = "code"
    FORMULA = "formula"
    PAGE_HEADER = "page_header"
    PAGE_FOOTER = "page_footer"
    FOOTNOTE = "footnote"
    OTHER = "other"


class DocBlock(ApiModel):
    """One layout block. ``bbox`` is [x0, y0, x1, y1] normalized to 0..1 with a
    top-left origin; ``None`` in basic tier (no layout model ran)."""

    type: BlockType
    text: str
    page: int = Field(ge=1)
    bbox: list[float] | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class DocTable(ApiModel):
    page: int = Field(ge=1)
    bbox: list[float] | None = None
    cells: list[list[str]]
    markdown: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class ParseDocumentRequest(ApiModel):
    file_name: str = Field(min_length=1)
    content_base64: str = Field(min_length=1)
    with_ocr: bool = True


class ParseDocumentResponse(ApiModel):
    mode: DocparseTier
    pages: int = Field(ge=0)
    blocks: list[DocBlock] = Field(default_factory=list)
    tables: list[DocTable] = Field(default_factory=list)
    markdown: str = ""
    ocr_applied: bool = False


class ExtractTablesRequest(ApiModel):
    file_name: str = Field(min_length=1)
    content_base64: str = Field(min_length=1)


class ExtractTablesResponse(ApiModel):
    mode: DocparseTier
    tables: list[DocTable] = Field(default_factory=list)


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
    content_base64: str | None = None
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


class FieldCitation(ApiModel):
    """Where a value came from. ``quote`` is always set; ``bbox`` only when a
    layout parse ran (advanced tier); offsets index into the cited page's text."""

    page: int | None = Field(default=None, ge=1)
    bbox: list[float] | None = None
    quote: str
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)


class ExtractedField(ApiModel):
    name: str
    value: JsonValue = None
    confidence: float = Field(ge=0.0, le=1.0)
    citations: list[FieldCitation] = Field(default_factory=list)


class ExtractFieldsRequest(ApiModel):
    """``pages`` drives the basic tier (caller-extracted text); ``content_base64``
    lets the advanced tier parse the raw file itself. Send either or both."""

    file_name: str = Field(min_length=1)
    fields_schema: dict[str, JsonValue]
    pages: list[PageText] | None = None
    content_base64: str | None = None
    mode: DocparseMode = DocparseMode.AUTO
    instructions: str | None = None


class ExtractFieldsResponse(ApiModel):
    mode: DocparseTier
    fields: list[ExtractedField] = Field(default_factory=list)
    overall_confidence: float = Field(ge=0.0, le=1.0)


class SuggestedFieldType(StrEnum):
    """Scalar types the schema suggester may propose; the extractor's leaf subset."""

    STRING = "string"
    NUMBER = "number"
    INTEGER = "integer"
    BOOLEAN = "boolean"


class SuggestedField(ApiModel):
    name: str = Field(description="snake_case field identifier, e.g. 'invoice_number'.")
    type: SuggestedFieldType
    description: str = ""


class SuggestSchemaRequest(ApiModel):
    """``pages`` drives the basic tier (caller-extracted text); ``content_base64``
    lets the advanced tier parse the raw file itself. Send either."""

    file_name: str = Field(min_length=1)
    pages: list[PageText] | None = None
    content_base64: str | None = None
    max_fields: int = Field(default=8, ge=1, le=20)


class SuggestSchemaResponse(ApiModel):
    mode: DocparseTier
    fields: list[SuggestedField] = Field(default_factory=list)


class DocparseCapabilities(ApiModel):
    """What the engine can actually do right now; Java caches and republishes this."""

    advanced_installed: bool
    docling_version: str | None = None
    torch_version: str | None = None
    models_available: bool = False
    models_path: str | None = None
    errors: list[str] = Field(default_factory=list)
