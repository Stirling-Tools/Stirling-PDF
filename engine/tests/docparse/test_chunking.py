from __future__ import annotations

from stirling.contracts.docparse import MarkdownBlock
from stirling.docparse.chunking import pack_blocks, page_texts
from stirling.documents.chunker import chunk_text


def block(
    markdown: str,
    page: int = 1,
    page_end: int | None = None,
    headings: list[str] | None = None,
) -> MarkdownBlock:
    return MarkdownBlock(
        markdown=markdown,
        page_start=page,
        page_end=page_end if page_end is not None else page,
        heading_path=headings or [],
    )


def test_pack_blocks_packs_whole_blocks_up_to_chunk_size() -> None:
    chunks = pack_blocks([block("aaa"), block("bbb"), block("ccc")], chunk_size=10, overlap=0)
    assert [c.text for c in chunks] == ["aaa\n\nbbb\n\nccc"]
    assert chunks[0].index == 0


def test_pack_blocks_starts_a_new_chunk_when_the_next_block_would_not_fit() -> None:
    chunks = pack_blocks([block("aaaa"), block("bbbb"), block("cccc")], chunk_size=8, overlap=0)
    assert [c.text for c in chunks] == ["aaaa\n\nbbbb", "cccc"]
    assert [c.index for c in chunks] == [0, 1]


def test_pack_blocks_takes_pages_from_the_min_and_max_of_what_it_packed() -> None:
    chunks = pack_blocks(
        [block("alpha", page=2), block("beta", page=3, page_end=4), block("gamma", page=4)],
        chunk_size=64,
        overlap=0,
    )
    assert len(chunks) == 1
    assert (chunks[0].page_start, chunks[0].page_end) == (2, 4)


def test_pack_blocks_takes_the_heading_path_of_the_heading_it_holds() -> None:
    chunks = pack_blocks(
        [block("## Risks", headings=["Report", "Risks"]), block("body", headings=["Report", "Risks"])],
        chunk_size=64,
        overlap=0,
    )
    assert chunks[0].heading_path == ["Report", "Risks"]


def test_pack_blocks_labels_a_chunk_whose_heading_is_not_its_first_block() -> None:
    # Nothing overflows, so the heading sits mid-chunk; the breadcrumb must still find it.
    chunks = pack_blocks(
        [
            block("preamble"),
            block("# Intro", headings=["Intro"]),
            block("body", headings=["Intro"]),
        ],
        chunk_size=512,
        overlap=0,
    )
    assert len(chunks) == 1
    assert chunks[0].heading_path == ["Intro"]


def test_pack_blocks_keeps_a_migrated_heading_run_inside_chunk_size() -> None:
    # The held headings reseed the next buffer, so they must be re-measured before the block
    # that triggered the migration is appended to them.
    chunks = pack_blocks(
        [
            block("x" * 10),
            block("# Section One", headings=["Section One"]),
            block("## Section Two", headings=["Section One", "Section Two"]),
            block("y" * 20, headings=["Section One", "Section Two"]),
        ],
        chunk_size=40,
        overlap=0,
    )
    assert [c.text for c in chunks] == ["x" * 10, "# Section One\n\n## Section Two", "y" * 20]
    assert all(len(c.text) <= 40 for c in chunks)


def test_pack_blocks_keeps_a_trailing_heading_with_the_text_it_introduces() -> None:
    chunks = pack_blocks(
        [
            block("para a"),
            block("## Section", headings=["Section"]),
            block("para b", headings=["Section"]),
        ],
        chunk_size=20,
        overlap=0,
    )
    assert [c.text for c in chunks] == ["para a", "## Section\n\npara b"]
    assert [c.heading_path for c in chunks] == [[], ["Section"]]


def test_pack_blocks_emits_a_heading_only_buffer_rather_than_looping() -> None:
    chunks = pack_blocks([block("# A"), block("## B"), block("body xyz")], chunk_size=8, overlap=0)
    assert [c.text for c in chunks] == ["# A\n\n## B", "body xyz"]


def test_pack_blocks_carries_overlap_across_a_chunk_boundary() -> None:
    chunks = pack_blocks(
        [block("alpha beta gamma"), block("delta epsilon zeta", page=2)],
        chunk_size=20,
        overlap=8,
    )
    assert [c.text for c in chunks] == ["alpha beta gamma", "gamma\n\ndelta epsilon zeta"]
    # The carry duplicates page 1 text, so it must not drag page 1 into the second chunk.
    assert (chunks[1].page_start, chunks[1].page_end) == (2, 2)


def test_pack_blocks_falls_back_to_the_character_chunker_for_an_over_long_block() -> None:
    long_block = "Alpha beta gamma delta. " * 10
    chunks = pack_blocks([block(long_block, page=4, page_end=5, headings=["Intro"])], chunk_size=64, overlap=0)
    assert [c.text for c in chunks] == chunk_text(long_block.strip(), chunk_size=64, overlap=0)
    assert len(chunks) > 1
    assert all((c.page_start, c.page_end) == (4, 5) for c in chunks)
    assert all(c.heading_path == ["Intro"] for c in chunks)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_pack_blocks_flushes_the_buffer_before_an_over_long_block() -> None:
    long_block = "Alpha beta gamma delta. " * 10
    chunks = pack_blocks([block("short intro"), block(long_block)], chunk_size=64, overlap=0)
    assert chunks[0].text == "short intro"
    assert len(chunks) == 1 + len(chunk_text(long_block.strip(), chunk_size=64, overlap=0))


def test_pack_blocks_skips_blank_blocks() -> None:
    chunks = pack_blocks([block("   "), block("real"), block("\n\n")], chunk_size=64, overlap=0)
    assert [c.text for c in chunks] == ["real"]


def test_pack_blocks_returns_nothing_for_nothing() -> None:
    assert pack_blocks([], chunk_size=64, overlap=0) == []


def test_page_texts_groups_by_page_and_sorts() -> None:
    pages = page_texts([block("second", page=2), block("first", page=1), block("also first", page=1)])
    assert [(p.page_number, p.text) for p in pages] == [(1, "first\n\nalso first"), (2, "second")]


def test_page_texts_attributes_a_stitched_block_to_where_it_started() -> None:
    pages = page_texts([block("table halves", page=1, page_end=2), block("page two body", page=2)])
    assert [(p.page_number, p.text) for p in pages] == [(1, "table halves"), (2, "page two body")]


def test_page_texts_skips_blank_blocks() -> None:
    assert page_texts([block("  ", page=1), block("kept", page=2)]) == page_texts([block("kept", page=2)])
