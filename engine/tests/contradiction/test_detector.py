"""ContradictionDetector — end-to-end agent flow with stubbed LLMs.

The detector orchestrates five stages (chunked claim extraction,
subject canonicalisation, pre-filter, per-bucket pair detection, and
summary). These tests stub the model-boundary agents and the document
service so the orchestration shape is exercised without network.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from pydantic_ai.exceptions import AgentRunError

from stirling.agents.contradiction.detector import (
    ContradictionDetector,
    _BucketContradictions,
    _DetectedPair,
    _ExtractedClaim,
    _ExtractedClaims,
    _SubjectMapping,
)
from stirling.agents.shared.chunked_mapper import ChunkOutput
from stirling.contracts import AiFile
from stirling.contracts.contradiction import ContradictionSeverity
from stirling.contracts.documents import Page
from stirling.models import FileId
from stirling.services.runtime import AppRuntime


def _page(n: int, text: str) -> Page:
    return Page(page_number=n, text=text, char_count=len(text))


def _stub_result(output: Any) -> Any:
    """Shape matches what ``agent.run`` returns: an object with ``.output``."""

    class _R:
        def __init__(self, o: Any) -> None:
            self.output = o

    return _R(output)


@pytest.fixture
def file_a() -> AiFile:
    return AiFile(id=FileId("doc-a"), name="a.pdf")


@pytest.fixture
def pages_a() -> list[Page]:
    return [
        _page(1, "The deadline is March 5."),
        _page(2, "The deadline is April 10."),
    ]


def _install_documents_stub(runtime: AppRuntime, pages_by_id: dict[FileId, list[Page]]) -> None:
    """Patch ``runtime.documents.read_pages`` to return canned pages per file."""

    async def _read(collection: FileId, page_range: Any = None) -> list[Page]:
        return pages_by_id.get(collection, [])

    # AppRuntime is frozen; monkey-patch the documents service.
    runtime.documents.read_pages = _read  # type: ignore[method-assign]


# Empty / no-pages cases


@pytest.mark.anyio
async def test_no_pages_returns_clean_empty_report(runtime: AppRuntime, file_a: AiFile) -> None:
    _install_documents_stub(runtime, {file_a.id: []})
    detector = ContradictionDetector(runtime)

    report = await detector.detect([file_a])

    assert report.contradictions == []
    assert report.pages_examined == []
    assert report.clean is True


# Happy path


@pytest.mark.anyio
async def test_happy_path_finds_contradiction_across_two_pages(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]
) -> None:
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1,
                subject="deadline",
                polarity="assert",
                text="The deadline is March 5.",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=2,
                subject="deadline",
                polarity="assert",
                text="The deadline is April 10.",
                quote="The deadline is April 10.",
            ),
        ]
    )
    chunk_output = ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1-2")
    detector._mapper.map_pages = AsyncMock(return_value=[chunk_output])  # type: ignore[method-assign]

    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(mapping={"deadline": "deadline"}))
    )  # type: ignore[method-assign]
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="dates conflict", severity="error")]
            )
        )
    )  # type: ignore[method-assign]
    detector._summary_agent.run = AsyncMock(
        return_value=_stub_result("Examined 2 pages; found 1 contradiction.")
    )  # type: ignore[method-assign]

    report = await detector.detect([file_a], query="check the deadline")

    assert len(report.contradictions) == 1
    c = report.contradictions[0]
    assert c.subject == "deadline"
    assert c.severity == ContradictionSeverity.ERROR
    assert {c.claim1.page, c.claim2.page} == {1, 2}
    assert c.explanation == "dates conflict"
    assert report.pages_examined == [1, 2]
    assert report.clean is False
    assert report.summary.startswith("Examined")


@pytest.mark.anyio
async def test_zero_claims_returns_clean_report(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]
) -> None:
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    detector._mapper.map_pages = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            ChunkOutput(pages=[1, 2], output=_ExtractedClaims(claims=[]), label="pages=1-2")
        ]
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("All clean."))  # type: ignore[method-assign]

    report = await detector.detect([file_a])

    assert report.contradictions == []
    assert report.clean is True
    assert report.pages_examined == []
    assert report.summary == "All clean."


@pytest.mark.anyio
async def test_canonicaliser_failure_falls_back_to_lexical_keys(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]
) -> None:
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1, subject="Project Deadline", polarity="assert",
                text="A1", quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=2, subject="the project deadline", polarity="assert",
                text="A2", quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(  # type: ignore[method-assign]
        return_value=[ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1-2")]
    )
    detector._subject_canonicaliser.run = AsyncMock(side_effect=AgentRunError("boom"))  # type: ignore[method-assign]
    detector._pair_detector.run = AsyncMock(  # type: ignore[method-assign]
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="conflict", severity="warning")]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))  # type: ignore[method-assign]

    report = await detector.detect([file_a])

    # Lexical key collapses both subjects so the bucket still forms.
    assert len(report.contradictions) == 1
    assert report.contradictions[0].severity == ContradictionSeverity.WARNING


@pytest.mark.anyio
async def test_same_page_same_polarity_pair_is_dropped(
    runtime: AppRuntime, file_a: AiFile
) -> None:
    """The result-time pre-filter removes pairs where both claims share a
    page AND polarity — they are duplicate sightings, not contradictions."""
    pages = [_page(1, "Claim A. Claim B variant.")]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1, subject="deadline", polarity="assert", text="x", quote="Claim A."
            ),
            _ExtractedClaim(
                page=1, subject="deadline", polarity="assert",
                text="y", quote="Claim B variant.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(  # type: ignore[method-assign]
        return_value=[ChunkOutput(pages=[1], output=extracted_chunk, label="pages=1")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(mapping={"deadline": "deadline"}))
    )  # type: ignore[method-assign]
    detector._pair_detector.run = AsyncMock(  # type: ignore[method-assign]
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="echo", severity="warning")]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))  # type: ignore[method-assign]

    report = await detector.detect([file_a])

    assert report.contradictions == []


@pytest.mark.anyio
async def test_summary_fallback_used_when_llm_fails(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]
) -> None:
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    detector._mapper.map_pages = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            ChunkOutput(pages=[1, 2], output=_ExtractedClaims(claims=[]), label="pages=1-2")
        ]
    )
    detector._summary_agent.run = AsyncMock(side_effect=AgentRunError("boom"))  # type: ignore[method-assign]

    report = await detector.detect([file_a])

    assert "No contradictions" in report.summary
    assert report.clean is True


@pytest.mark.anyio
async def test_pages_examined_excludes_pages_without_claims(
    runtime: AppRuntime, file_a: AiFile
) -> None:
    pages = [
        _page(1, "The deadline is March 5."),
        _page(2, "Blank-ish."),  # extractor returns no claims for this page
        _page(3, "The deadline is April 10."),
    ]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    extracted = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1, subject="deadline", polarity="assert",
                text="x", quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=3, subject="deadline", polarity="assert",
                text="y", quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(  # type: ignore[method-assign]
        return_value=[ChunkOutput(pages=[1, 2, 3], output=extracted, label="pages=1-3")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(mapping={}))
    )  # type: ignore[method-assign]
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(_BucketContradictions(pairs=[]))
    )  # type: ignore[method-assign]
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))  # type: ignore[method-assign]

    report = await detector.detect([file_a])

    # Page 2 produced no claims, so it's excluded from pages_examined.
    assert report.pages_examined == [1, 3]


@pytest.mark.anyio
async def test_multi_file_pages_dont_collide_in_validation(runtime: AppRuntime) -> None:
    """Regression — Aikido finding on PR #6369.

    When two files both have a page 1 and the detector aggregates pages
    across files, a flat ``{page_number: Page}`` dict would let one file
    overwrite the other and validation would use the wrong page text.
    Per-file iteration MUST keep each file's pages_by_num isolated.

    This test gives both files a page-1 claim whose ``quote`` only matches
    the OWN file's page-1 text. If the bug ever returns, one of the claims
    will validate against the wrong file's text and produce the wrong
    ``anchor_quality`` (or be dropped entirely on substring miss).
    """
    file_a = AiFile(id=FileId("a"), name="a.pdf")
    file_b = AiFile(id=FileId("b"), name="b.pdf")
    _install_documents_stub(
        runtime,
        {
            file_a.id: [_page(1, "alpha file says the deadline is March 5.")],
            file_b.id: [_page(1, "beta file says the deadline is April 1.")],
        },
    )
    detector = ContradictionDetector(runtime)

    chunk_a = ChunkOutput(
        pages=[1],
        output=_ExtractedClaims(
            claims=[
                _ExtractedClaim(
                    page=1,
                    subject="deadline",
                    polarity="assert",
                    text="March 5 deadline",
                    quote="the deadline is March 5",
                )
            ]
        ),
        label="a:p1",
    )
    chunk_b = ChunkOutput(
        pages=[1],
        output=_ExtractedClaims(
            claims=[
                _ExtractedClaim(
                    page=1,
                    subject="deadline",
                    polarity="assert",
                    text="April 1 deadline",
                    quote="the deadline is April 1",
                )
            ]
        ),
        label="b:p1",
    )

    # ``map_pages`` is called once per file (per-file iteration); return
    # the file-specific chunk by inspecting which page list was passed.
    async def _map_pages(pages: list[Page], _query: str) -> list[ChunkOutput[Any]]:
        text = pages[0].text
        if "alpha" in text:
            return [chunk_a]
        if "beta" in text:
            return [chunk_b]
        return []

    detector._mapper.map_pages = _map_pages  # type: ignore[method-assign]
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(mapping={}))
    )  # type: ignore[method-assign]
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="dates conflict", severity="error")]
            )
        )
    )  # type: ignore[method-assign]
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("ok"))  # type: ignore[method-assign]

    report = await detector.detect([file_a, file_b])

    # Both claims validated as verbatim — each against the right file's
    # page text. A collision bug would have produced "paraphrased" for at
    # least one (the quote wouldn't be found in the other file's page).
    assert len(report.contradictions) == 1
    pair = report.contradictions[0]
    claims_by_file = {c.file_name: c for c in (pair.claim1, pair.claim2)}
    assert set(claims_by_file) == {"a.pdf", "b.pdf"}
    assert claims_by_file["a.pdf"].anchor_quality == "verbatim"
    assert claims_by_file["b.pdf"].anchor_quality == "verbatim"
    # And page numbers are kept unaltered even though they collide.
    assert claims_by_file["a.pdf"].page == 1
    assert claims_by_file["b.pdf"].page == 1
