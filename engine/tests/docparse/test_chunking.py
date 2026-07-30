from __future__ import annotations

from stirling.contracts import PageText
from stirling.contracts.docparse import BlockType, DocBlock, DocparseTier, ParseDocumentResponse
from stirling.docparse.chunking import advanced_chunks, basic_chunks


def test_basic_chunks_carry_page_numbers() -> None:
    pages = [
        PageText(page_number=1, text="alpha " * 200),
        PageText(page_number=2, text="beta " * 200),
    ]
    result = basic_chunks(pages, chunk_size=256, overlap=32)
    assert result.mode is DocparseTier.BASIC
    assert len(result.chunks) >= 4
    assert {c.page_start for c in result.chunks} == {1, 2}
    assert [c.index for c in result.chunks] == list(range(len(result.chunks)))


def _parse_fixture() -> ParseDocumentResponse:
    blocks = [
        DocBlock(type=BlockType.PAGE_HEADER, text="CONFIDENTIAL", page=1),
        DocBlock(type=BlockType.HEADING, text="1. Introduction", page=1),
        DocBlock(type=BlockType.PARAGRAPH, text="Short intro paragraph.", page=1),
        DocBlock(type=BlockType.PARAGRAPH, text="Second paragraph on same topic.", page=1),
        DocBlock(type=BlockType.HEADING, text="2. Terms", page=2),
        DocBlock(type=BlockType.PARAGRAPH, text="terms " * 300, page=2),
    ]
    return ParseDocumentResponse(mode=DocparseTier.ADVANCED, pages=2, blocks=blocks, tables=[], markdown="")


def test_advanced_chunks_respect_headings_and_skip_furniture() -> None:
    result = advanced_chunks(_parse_fixture(), chunk_size=512, overlap=64)
    assert result.mode is DocparseTier.ADVANCED
    texts = [c.text for c in result.chunks]
    assert all("CONFIDENTIAL" not in t for t in texts)
    intro = next(c for c in result.chunks if "Short intro" in c.text)
    assert intro.heading_path[-1] == "1. Introduction"
    assert intro.page_start == 1
    # Intro chunk must not bleed into the Terms section.
    assert "terms" not in intro.text


def test_advanced_chunks_split_oversized_blocks() -> None:
    result = advanced_chunks(_parse_fixture(), chunk_size=512, overlap=64)
    terms_chunks = [c for c in result.chunks if c.heading_path and c.heading_path[-1] == "2. Terms"]
    assert len(terms_chunks) > 1
    assert all(c.page_start == 2 for c in terms_chunks)
