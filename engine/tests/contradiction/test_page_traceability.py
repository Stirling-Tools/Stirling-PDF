"""Page-traceability validation for extracted claims.

Covers the wrapper logic that maps an LLM-emitted ``_ExtractedClaim`` to
the public ``Claim`` after sanity-checking its declared page against
the chunk's covered pages, and assigns ``anchor_quality`` based on
whether the quote is a verbatim substring of the page's text.
"""

from __future__ import annotations

from stirling.agents.contradiction.detector import (
    ContradictionDetector,
    _ExtractedClaim,
    _ExtractedClaims,
)
from stirling.agents.shared.chunked_mapper import ChunkOutput
from stirling.contracts.contradiction import ClaimPolarity
from stirling.contracts.documents import Page


def _page(n: int, text: str) -> Page:
    return Page(page_number=n, text=text, char_count=len(text))


def _chunk_output(pages: list[Page]) -> ChunkOutput[_ExtractedClaims]:
    page_nums = [p.page_number for p in pages]
    label = f"pages={page_nums[0]}" if len(page_nums) == 1 else f"pages={page_nums[0]}-{page_nums[-1]}"
    return ChunkOutput(pages=page_nums, output=_ExtractedClaims(claims=[]), label=label)


def _raw(
    *,
    page: int,
    quote: str,
    subject: str = "deadline",
    polarity: ClaimPolarity = "assert",
    text: str = "Claim about the deadline.",
) -> _ExtractedClaim:
    return _ExtractedClaim(
        page=page,
        subject=subject,
        polarity=polarity,
        text=text,
        quote=quote,
    )


# Valid page → kept


def test_valid_page_in_chunk_is_kept_verbatim() -> None:
    pages = [_page(1, "The deadline is March 5."), _page(2, "Other content.")]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=1, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is not None
    assert claim.page == 1
    assert claim.anchor_quality == "verbatim"


def test_quote_present_in_page_text_yields_verbatim_anchor() -> None:
    pages = [_page(1, "Sentence A. The deadline is March 5. Sentence C.")]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=1, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is not None
    assert claim.anchor_quality == "verbatim"


def test_quote_absent_from_page_text_yields_paraphrased_anchor() -> None:
    """A claim whose quote isn't a substring of the declared page must
    still survive (the LLM may have paraphrased), but it's marked
    paraphrased so the comment placer falls back to margin geometry."""
    pages = [_page(1, "March 5 was named as the deadline.")]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=1, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is not None
    assert claim.page == 1
    assert claim.anchor_quality == "paraphrased"


# Page outside chunk + mechanical fallback


def test_page_outside_chunk_but_quote_uniquely_in_another_page_is_reassigned() -> None:
    """LLM declared page 3, but the quote literally appears on page 2 (which
    is in the chunk). The wrapper reassigns and keeps the claim."""
    pages = [
        _page(1, "Nothing relevant here."),
        _page(2, "The deadline is March 5."),
    ]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=3, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is not None
    assert claim.page == 2  # reassigned mechanically
    assert claim.anchor_quality == "verbatim"


def test_page_outside_chunk_and_quote_not_in_any_chunk_page_is_dropped() -> None:
    pages = [_page(1, "Unrelated."), _page(2, "Also unrelated.")]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=3, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is None


def test_quote_matching_multiple_chunk_pages_is_dropped() -> None:
    """Ambiguous reassignment: if more than one chunk page contains the quote,
    we have no way to pick — drop with a warning instead of guessing."""
    pages = [
        _page(1, "The deadline is March 5."),
        _page(2, "The deadline is March 5."),
    ]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _raw(page=99, quote="The deadline is March 5.")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)

    assert claim is None


# Defensive drops


def test_empty_subject_drops_claim() -> None:
    pages = [_page(1, "anything")]
    chunk = _chunk_output(pages)
    pages_by_num = {p.page_number: p for p in pages}
    raw = _ExtractedClaim(page=1, subject="   ", polarity="assert", text="real text", quote="real quote")

    claim = ContradictionDetector._validate_extracted_claim(raw, chunk, pages_by_num)
    assert claim is None
