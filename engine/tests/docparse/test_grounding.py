from __future__ import annotations

from pydantic import BaseModel

from stirling.contracts import PageText
from stirling.docparse.extractor import (
    VALUE_GROUNDED_FLOOR,
    ExtractFieldsAgent,
    build_output_model,
    find_quote,
)
from stirling.docparse.splitter import _Boundary, _SplitOutput, validate_boundaries


def _pages() -> list[PageText]:
    return [
        PageText(page_number=1, text="Invoice INV-123\nTotal due:   1,240.00 EUR"),
        PageText(page_number=2, text="Payment terms\nNet 30 days from receipt."),
    ]


def test_find_quote_exact() -> None:
    located = find_quote("Invoice INV-123", _pages())
    assert located is not None
    page, start, end = located
    assert page == 1
    assert start == 0


def test_find_quote_is_whitespace_insensitive() -> None:
    located = find_quote("Total due: 1,240.00 EUR", _pages())
    assert located is not None
    assert located[0] == 1


def test_find_quote_is_case_insensitive_and_crosses_pages() -> None:
    located = find_quote("net 30 DAYS", _pages())
    assert located is not None
    assert located[0] == 2


def test_find_quote_missing_returns_none() -> None:
    assert find_quote("does not appear", _pages()) is None
    assert find_quote("   ", _pages()) is None


def test_validate_boundaries_partitions_cleanly() -> None:
    output = _SplitOutput(
        boundaries=[
            _Boundary(start_page=4, label="Invoice B", confidence=0.8),
            _Boundary(start_page=1, label="Invoice A", confidence=0.9),
            _Boundary(start_page=4, label="dup", confidence=0.1),
            _Boundary(start_page=99, label="out of range", confidence=0.5),
        ]
    )
    parts = validate_boundaries(output, page_count=6, max_parts=10)
    assert [(p.start_page, p.end_page) for p in parts] == [(1, 3), (4, 6)]
    assert parts[0].label == "Invoice A"


def test_validate_boundaries_inserts_page_one() -> None:
    output = _SplitOutput(boundaries=[_Boundary(start_page=3, label="Part", confidence=0.7)])
    parts = validate_boundaries(output, page_count=5, max_parts=10)
    assert parts[0].start_page == 1
    assert parts[1].start_page == 3
    assert parts[-1].end_page == 5


def test_validate_boundaries_empty_output_spans_whole_file() -> None:
    parts = validate_boundaries(_SplitOutput(), page_count=7, max_parts=10)
    assert [(p.start_page, p.end_page) for p in parts] == [(1, 7)]


def _answers(quote: str | None, confidence: float) -> BaseModel:
    model = build_output_model({"type": "object", "properties": {"invoice_number": {"type": "string"}}})
    return model.model_validate({"invoiceNumber": {"value": "INV-123", "quote": quote, "confidence": confidence}})


def test_ground_falls_back_to_value_when_quote_missing() -> None:
    # Terse local models return the value but no quote; the value itself grounds.
    pages = [PageText(page_number=1, text="Invoice INV-123 issued today.")]
    fields = ExtractFieldsAgent._ground(_answers(quote=None, confidence=0.0), pages, None)
    assert fields[0].citations and fields[0].citations[0].page == 1
    assert fields[0].citations[0].quote == "INV-123"
    assert fields[0].confidence >= VALUE_GROUNDED_FLOOR


def test_ground_penalises_when_nothing_grounds() -> None:
    pages = [PageText(page_number=1, text="completely unrelated text")]
    fields = ExtractFieldsAgent._ground(_answers(quote=None, confidence=0.9), pages, None)
    assert not fields[0].citations
    assert fields[0].confidence < 0.9
