from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from stirling.agents.document_classifier import (
    DEFAULT_LABELS,
    MAX_ASSIGNED_LABELS,
    DocumentClassifierAgent,
    _ClassifierOutput,
    render_labels,
    select_window,
    validate_labels,
)
from stirling.contracts import (
    ClassifyDocumentRequest,
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


# ── validate_labels ──────────────────────────────────────────────────────────


def test_valid_labels_are_preserved_in_order() -> None:
    output = _ClassifierOutput(labels=["Invoice", "Receipt"])
    result = validate_labels(output, ["Invoice", "Receipt", "Purchase order"])
    assert isinstance(result, DocumentClassificationResponse)
    assert result.labels == ["Invoice", "Receipt"]


def test_off_list_labels_are_dropped() -> None:
    output = _ClassifierOutput(labels=["Invoice", "Warp core", "Receipt"])
    result = validate_labels(output, ["Invoice", "Receipt"])
    assert result.labels == ["Invoice", "Receipt"]


def test_matching_is_case_insensitive_and_returns_canonical_casing() -> None:
    output = _ClassifierOutput(labels=["invoice", " CREDIT NOTE "])
    result = validate_labels(output, ["Invoice", "Credit note"])
    assert result.labels == ["Invoice", "Credit note"]


def test_duplicates_collapse_to_first_occurrence() -> None:
    output = _ClassifierOutput(labels=["Invoice", "invoice", "Receipt", "INVOICE"])
    result = validate_labels(output, ["Invoice", "Receipt"])
    assert result.labels == ["Invoice", "Receipt"]


def test_result_is_capped_at_max_assigned_labels() -> None:
    allowed = [f"Label {n}" for n in range(10)]
    output = _ClassifierOutput(labels=allowed)
    result = validate_labels(output, allowed)
    assert result.labels == allowed[:MAX_ASSIGNED_LABELS]


def test_empty_answer_is_valid() -> None:
    result = validate_labels(_ClassifierOutput(labels=[]), ["Invoice"])
    assert result.labels == []


def test_entirely_off_list_answer_yields_empty_result() -> None:
    output = _ClassifierOutput(labels=["Spaceship", "Boarding pass"])
    result = validate_labels(output, ["Invoice", "Receipt"])
    assert result.labels == []


# ── render_labels ────────────────────────────────────────────────────────────


def test_render_labels_lists_the_vocabulary() -> None:
    rendered = render_labels(["Invoice", "Receipt"])
    assert "Invoice" in rendered
    assert "Receipt" in rendered


def test_render_labels_handles_empty_vocabulary() -> None:
    assert "(none)" in render_labels([])


# ── DEFAULT_LABELS ───────────────────────────────────────────────────────────


def test_default_labels_load_from_generated_json() -> None:
    assert DEFAULT_LABELS
    assert all(isinstance(label, str) and label for label in DEFAULT_LABELS)


# ── DocumentClassifierAgent (inline page text) ───────────────────────────────


def _stub_model_answer(agent: DocumentClassifierAgent, labels: list[str]) -> AsyncMock:
    mock = AsyncMock(return_value=SimpleNamespace(output=_ClassifierOutput(labels=labels)))
    agent._agent.run = mock
    return mock


@pytest.mark.anyio
async def test_classify_falls_back_to_default_labels_when_omitted(runtime: AppRuntime) -> None:
    agent = DocumentClassifierAgent(runtime)
    run_mock = _stub_model_answer(agent, ["Invoice", "Boarding pass to Mars"])

    result = await agent.classify(
        ClassifyDocumentRequest(
            file_name="invoice.pdf",
            pages=[PageText(page_number=1, text="Invoice INV-1 total due 100.00")],
        )
    )

    assert isinstance(result, DocumentClassificationResponse)
    assert result.labels == ["Invoice"]
    assert run_mock.await_args is not None
    prompt = run_mock.await_args.args[0]
    assert DEFAULT_LABELS[0] in prompt


@pytest.mark.anyio
async def test_classify_treats_empty_label_list_as_fallback(runtime: AppRuntime) -> None:
    agent = DocumentClassifierAgent(runtime)
    _stub_model_answer(agent, ["Invoice"])

    result = await agent.classify(ClassifyDocumentRequest(file_name="a.pdf", pages=[], labels=[]))

    assert result.labels == ["Invoice"]  # matched against DEFAULT_LABELS, not the empty list


@pytest.mark.anyio
async def test_classify_respects_request_supplied_vocabulary(runtime: AppRuntime) -> None:
    agent = DocumentClassifierAgent(runtime)
    run_mock = _stub_model_answer(agent, ["board minutes", "Invoice"])

    result = await agent.classify(
        ClassifyDocumentRequest(
            file_name="minutes.pdf",
            pages=[PageText(page_number=1, text="Minutes of the board meeting")],
            labels=["Board minutes", "Agenda"],
        )
    )

    # "Invoice" is off this request's vocabulary even though the default knows it.
    assert result.labels == ["Board minutes"]
    assert run_mock.await_args is not None
    prompt = run_mock.await_args.args[0]
    assert "Board minutes" in prompt
    assert "Agenda" in prompt
