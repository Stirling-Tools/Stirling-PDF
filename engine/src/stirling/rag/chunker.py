from __future__ import annotations

import re

# TODO: replace with pydantic-ai's built-in chunking once
# https://github.com/pydantic/pydantic-ai/issues/3962 lands.


def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Split text into chunks of approximately chunk_size characters with overlap.

    Splits on paragraph then sentence boundaries to avoid cutting mid-thought.
    Returns an empty list for empty/whitespace-only input.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = _split_paragraphs(text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para)

        if current_len + para_len <= chunk_size:
            current.append(para)
            current_len += para_len
            continue

        # If the current buffer has content, flush it
        if current:
            chunks.append("\n\n".join(current))

        # If this paragraph alone exceeds chunk_size, split it by sentences
        if para_len > chunk_size:
            sentence_chunks = _split_long_paragraph(para, chunk_size, overlap)
            chunks.extend(sentence_chunks)
            current = []
            current_len = 0
        else:
            # Start new chunk with overlap from previous chunk
            overlap_text = _get_overlap(chunks, overlap) if chunks else ""
            if overlap_text:
                current = [overlap_text, para]
                current_len = len(overlap_text) + para_len
            else:
                current = [para]
                current_len = para_len

    if current:
        chunks.append("\n\n".join(current))

    return [c.strip() for c in chunks if c.strip()]


def _split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs on double newlines."""
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences, keeping the delimiter attached."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in parts if s.strip()]


def _split_long_paragraph(paragraph: str, chunk_size: int, overlap: int) -> list[str]:
    """Split a single long paragraph into sentence-boundary chunks."""
    sentences = _split_sentences(paragraph)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sentence in sentences:
        sent_len = len(sentence)

        if current_len + sent_len <= chunk_size:
            current.append(sentence)
            current_len += sent_len + 1  # +1 for space
            continue

        if current:
            chunks.append(" ".join(current))

        # If a single sentence exceeds chunk_size, force-split it
        if sent_len > chunk_size:
            for i in range(0, sent_len, chunk_size - overlap):
                chunks.append(sentence[i : i + chunk_size])
            current = []
            current_len = 0
        else:
            overlap_text = _get_overlap(chunks, overlap) if chunks else ""
            if overlap_text:
                current = [overlap_text, sentence]
                current_len = len(overlap_text) + sent_len + 1
            else:
                current = [sentence]
                current_len = sent_len

    if current:
        chunks.append(" ".join(current))

    return chunks


def _get_overlap(chunks: list[str], overlap: int) -> str:
    """Extract the last ~`overlap` characters from the most recent chunk, snapped to a word boundary."""
    if not chunks or overlap <= 0:
        return ""
    last = chunks[-1]
    tail = last[-overlap:] if len(last) > overlap else last
    # Snap to the nearest word boundary to avoid starting mid-word
    space_idx = tail.find(" ")
    if space_idx > 0:
        tail = tail[space_idx + 1 :]
    return tail
