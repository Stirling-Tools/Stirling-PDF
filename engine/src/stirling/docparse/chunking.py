"""RAG chunking, basic tier: the existing character chunker applied per page.

The advanced tier (structure-aware packing over layout blocks) arrives with
the docparse addon. No tokenizer dependency; sizes are characters, matching
the rest of the engine."""

from __future__ import annotations

from stirling.contracts.docparse import ChunkDocumentResponse, DocChunk, DocparseTier
from stirling.contracts.documents import PageText
from stirling.documents.chunker import chunk_text


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
