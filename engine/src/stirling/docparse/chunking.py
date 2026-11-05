"""Structure-aware packing of Markdown blocks into chunks.

Java's PDF-to-Markdown converter supplies page-attributed blocks; whole blocks are
packed up to chunk_size so a heading is never separated from the text it introduces.
The character chunker handles the one case blocks cannot: a single block that alone
exceeds chunk_size. Sizes are characters, matching the rest of the engine."""

from __future__ import annotations

import re

from stirling.contracts.docparse import DocChunk, MarkdownBlock
from stirling.contracts.documents import PageText
from stirling.documents.chunker import chunk_text, tail_overlap

_ATX_HEADING = re.compile(r"^#{1,6} \S")


def _is_heading(markdown: str) -> bool:
    return _ATX_HEADING.match(markdown) is not None


def _chunk_headings(buffer: list[MarkdownBlock]) -> list[str]:
    """The chain of the chunk's own first heading, or of its first block when it holds none.

    The first block's chain alone would label a chunk whose heading sits mid-chunk with the
    previous section, which is the mistake the breadcrumb exists to avoid.
    """
    for block in buffer:
        if _is_heading(block.markdown):
            return list(block.heading_path)
    return list(buffer[0].heading_path)


def pack_blocks(blocks: list[MarkdownBlock], chunk_size: int, overlap: int) -> list[DocChunk]:
    """Pack whole blocks up to ``chunk_size``, splitting only a block too big to fit alone.

    ``chunk_size`` bounds the new text a chunk holds; on top of that a chunk carries the
    overlap tail of the one before it and two characters per joiner, which is the same
    approximation ``chunk_text`` makes.
    """
    chunks: list[DocChunk] = []
    buffer: list[MarkdownBlock] = []
    buffer_len = 0
    carry = ""

    def emit() -> None:
        """Turn the buffer into one chunk, then reseed the overlap carry from it."""
        nonlocal buffer, buffer_len, carry
        if not buffer:
            return
        parts = ([carry] if carry else []) + [block.markdown for block in buffer]
        text = "\n\n".join(parts).strip()
        if text:
            chunks.append(
                DocChunk(
                    index=len(chunks),
                    text=text,
                    page_start=min(block.page_start for block in buffer),
                    page_end=max(block.page_end for block in buffer),
                    heading_path=_chunk_headings(buffer),
                )
            )
        buffer = []
        carry = tail_overlap(chunks[-1].text, overlap) if chunks else ""
        buffer_len = len(carry)

    for block in blocks:
        markdown = block.markdown.strip()
        if not markdown:
            continue
        length = len(markdown)

        if length > chunk_size:
            # Too big to pack whole, so hand it to the character chunker, which applies
            # its own overlap; that is why nothing carries into or across this branch.
            emit()
            buffer, buffer_len, carry = [], 0, ""
            for piece in chunk_text(markdown, chunk_size=chunk_size, overlap=overlap):
                chunks.append(
                    DocChunk(
                        index=len(chunks),
                        text=piece,
                        page_start=block.page_start,
                        page_end=block.page_end,
                        heading_path=list(block.heading_path),
                    )
                )
            carry = tail_overlap(chunks[-1].text, overlap) if chunks else ""
            buffer_len = len(carry)
            continue

        if buffer and buffer_len + length > chunk_size:
            # Keep a heading with the text it introduces: a trailing run of heading-only
            # blocks moves to the front of the next chunk instead of ending this one.
            held: list[MarkdownBlock] = []
            while buffer and _is_heading(buffer[-1].markdown):
                held.insert(0, buffer.pop())
            if not buffer:
                buffer, held = held, []
            emit()
            for heading in held:
                buffer.append(heading)
                buffer_len += len(heading.markdown)
            if buffer and buffer_len + length > chunk_size:
                # A long heading run plus this block will not fit either; emit the headings
                # rather than let the migration push the chunk past chunk_size.
                emit()

        buffer.append(block.model_copy(update={"markdown": markdown}))
        buffer_len += length

    emit()
    return chunks


def page_texts(blocks: list[MarkdownBlock]) -> list[PageText]:
    """The whole-document read representation, one entry per page that has content.

    A block stitched across a page break is attributed to where it started, so its
    text appears once rather than on every page it touches.
    """
    by_page: dict[int, list[str]] = {}
    for block in blocks:
        markdown = block.markdown.strip()
        if markdown:
            by_page.setdefault(block.page_start, []).append(markdown)
    return [PageText(page_number=number, text="\n\n".join(by_page[number])) for number in sorted(by_page)]
