from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from stirling.agents.document_classifier import (
    DEFAULT_TAXONOMY,
    UNKNOWN_LABEL,
    UNKNOWN_MAX_CONFIDENCE,
    DocumentClassifierAgent,
    _ClassifierOutput,
    render_taxonomy,
    select_window,
    validate_against_taxonomy,
)
from stirling.contracts import (
    ClassificationTaxonomy,
    ClassifyDocumentRequest,
    DocumentCategory,
    DocumentClassificationResponse,
    PageText,
)
from stirling.services.runtime import AppRuntime


def _page(number: int, text: str = "x") -> PageText:
    return PageText(page_number=number, text=text)


# ── select_window ───────────────────────────────────────────────────────────


def test_select_window_returns_short_documents_whole() -> None:
    pages = [_page(1), _page(2), _page(3), _page(4)]
    assert select_window(pages, window=2) == pages


def test_select_window_takes_both_ends_without_overlap() -> None:
    pages = [_page(n) for n in range(1, 6)]  # 5 pages
    selected = select_window(pages, window=2)
    assert [p.page_number for p in selected] == [1, 2, 4, 5]


def test_select_window_handles_empty() -> None:
    assert select_window([], window=2) == []


def test_select_window_zero_returns_all() -> None:
    pages = [_page(1), _page(2), _page(3)]
    assert select_window(pages, window=0) == pages


# ── validate_against_taxonomy ────────────────────────────────────────────────


def test_valid_classification_is_preserved() -> None:
    output = _ClassifierOutput(category="contract", doc_type="nda", type_confidence=0.95, tags=["legal", "signed"])
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert isinstance(result, DocumentClassificationResponse)
    assert result.category == "contract"
    assert result.doc_type == "nda"
    assert result.type_confidence == 0.95
    assert result.tags == ["legal", "signed"]


def test_off_list_category_collapses_to_unknown_with_capped_confidence() -> None:
    output = _ClassifierOutput(category="spaceship", doc_type="warp_core", type_confidence=0.99)
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.category == UNKNOWN_LABEL
    assert result.doc_type == UNKNOWN_LABEL
    assert result.type_confidence == UNKNOWN_MAX_CONFIDENCE


def test_off_list_type_keeps_category_but_unknown_type() -> None:
    output = _ClassifierOutput(category="contract", doc_type="invoice", type_confidence=0.9)
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.category == "contract"
    assert result.doc_type == UNKNOWN_LABEL
    assert result.type_confidence == UNKNOWN_MAX_CONFIDENCE


def test_type_from_a_different_category_is_not_a_child() -> None:
    # "lab_result" is a valid type, but only under medical_record, not contract.
    output = _ClassifierOutput(category="contract", doc_type="lab_result", type_confidence=0.8)
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.category == "contract"
    assert result.doc_type == UNKNOWN_LABEL


def test_matching_is_case_insensitive_and_returns_canonical_ids() -> None:
    output = _ClassifierOutput(category="Contract", doc_type="NDA", type_confidence=0.7, tags=["LEGAL"])
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.category == "contract"
    assert result.doc_type == "nda"
    assert result.tags == ["legal"]


def test_unknown_tags_dropped_and_deduplicated_in_order() -> None:
    output = _ClassifierOutput(
        category="invoice",
        doc_type="invoice",
        type_confidence=0.9,
        tags=["finance", "made-up", "finance", "legal"],
    )
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.tags == ["finance", "legal"]


def test_low_confidence_is_not_raised_when_collapsing() -> None:
    output = _ClassifierOutput(category="nope", doc_type="nope", type_confidence=0.05)
    result = validate_against_taxonomy(output, DEFAULT_TAXONOMY)
    assert result.type_confidence == 0.05  # min(0.05, 0.2)


# ── render_taxonomy ──────────────────────────────────────────────────────────


def test_render_taxonomy_lists_ids_and_tags() -> None:
    rendered = render_taxonomy(DEFAULT_TAXONOMY)
    assert "contract" in rendered
    assert "nda" in rendered
    assert "finance" in rendered


def test_render_taxonomy_handles_category_without_types() -> None:
    taxonomy = ClassificationTaxonomy(
        categories=[DocumentCategory(id="memo", label="Memo", doc_types=[])],
        tags=[],
    )
    rendered = render_taxonomy(taxonomy)
    assert "(none)" in rendered


# ── DocumentClassifierAgent (inline page text) ───────────────────────────────


@pytest.mark.anyio
async def test_classify_validates_model_output_against_default_taxonomy(runtime: AppRuntime) -> None:
    agent = DocumentClassifierAgent(runtime)
    agent._agent.run = AsyncMock(
        return_value=SimpleNamespace(
            output=_ClassifierOutput(category="invoice", doc_type="invoice", type_confidence=0.97, tags=["finance"])
        )
    )

    result = await agent.classify(
        ClassifyDocumentRequest(
            file_name="invoice.pdf",
            pages=[PageText(page_number=1, text="Invoice INV-1 total due 100.00")],
        )
    )

    assert isinstance(result, DocumentClassificationResponse)
    assert result.category == "invoice"
    assert result.doc_type == "invoice"
    assert result.tags == ["finance"]


@pytest.mark.anyio
async def test_classify_collapses_off_list_model_answer(runtime: AppRuntime) -> None:
    agent = DocumentClassifierAgent(runtime)
    agent._agent.run = AsyncMock(
        return_value=SimpleNamespace(
            output=_ClassifierOutput(category="boarding_pass", doc_type="seat", type_confidence=0.9)
        )
    )

    result = await agent.classify(
        ClassifyDocumentRequest(file_name="weird.pdf", pages=[PageText(page_number=1, text="Some text")])
    )

    assert isinstance(result, DocumentClassificationResponse)
    assert result.category == UNKNOWN_LABEL
    assert result.doc_type == UNKNOWN_LABEL
    assert result.type_confidence == UNKNOWN_MAX_CONFIDENCE
