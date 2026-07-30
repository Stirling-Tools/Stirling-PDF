"""RAG chunking, both tiers.

Basic: the existing character chunker per page. Advanced: structure-aware
packing over parse blocks - heading-bounded, heading breadcrumbs attached,
page ranges tracked. No tokenizer dependency; sizes are characters, matching
the rest of the engine."""

from __future__ import annotations

from stirling.contracts.docparse import BlockType, ChunkDocumentResponse, DocChunk, DocparseTier, ParseDocumentResponse
from stirling.contracts.documents import PageText
from stirling.documents.chunker import chunk_text

# Blocks that are noise for retrieval purposes.
_SKIP_TYPES = {BlockType.PAGE_HEADER, BlockType.PAGE_FOOTER}


def basic_chunks(pages: list[PageText], chunk_size: int, overlap: int) -> ChunkDocumentResponse:
    chunks: list[DocChunk] = []
    for page in pages:
        for piece in chunk_text(page.text, chunk_size=chunk_size, overlap=overlap):
            chunks.append(
                DocChunk(
                    index=len(chunks),
                    text=piece,
                    page_start=page.page_number,
                    page_end=page.page_number,
                )
            )
    return ChunkDocumentResponse(mode=DocparseTier.BASIC, chunks=chunks)


def advanced_chunks(parse: ParseDocumentResponse, chunk_size: int, overlap: int) -> ChunkDocumentResponse:
    """Pack layout blocks into chunks that never straddle a heading boundary."""
    chunks: list[DocChunk] = []
    heading_path: list[str] = []
    buffer: list[str] = []
    buffer_len = 0
    page_start: int | None = None
    page_end: int | None = None
    buffer_headings: list[str] = []

    def flush() -> None:
        nonlocal buffer, buffer_len, page_start, page_end, buffer_headings
        text = "\n\n".join(buffer).strip()
        if text:
            chunks.append(
                DocChunk(
                    index=len(chunks),
                    text=text,
                    page_start=page_start,
                    page_end=page_end,
                    heading_path=list(buffer_headings),
                )
            )
        buffer = []
        buffer_len = 0
        page_start = None
        page_end = None
        buffer_headings = list(heading_path)

    buffer_headings = []
    for block in parse.blocks:
        if block.type in _SKIP_TYPES:
            continue
        if block.type is BlockType.HEADING:
            flush()
            heading_path = [*heading_path[-2:], block.text.strip()] if block.text.strip() else heading_path
            buffer_headings = list(heading_path)
            continue

        text = block.text
        if not text.strip():
            continue
        if buffer_len + len(text) > chunk_size and buffer:
            flush()
        # A single oversized block falls back to the character chunker.
        if len(text) > chunk_size:
            for piece in chunk_text(text, chunk_size=chunk_size, overlap=overlap):
                chunks.append(
                    DocChunk(
                        index=len(chunks),
                        text=piece,
                        page_start=block.page,
                        page_end=block.page,
                        heading_path=list(buffer_headings),
                    )
                )
            continue
        buffer.append(text)
        buffer_len += len(text)
        page_start = block.page if page_start is None else min(page_start, block.page)
        page_end = block.page if page_end is None else max(page_end, block.page)

    flush()
    return ChunkDocumentResponse(mode=DocparseTier.ADVANCED, chunks=chunks)
