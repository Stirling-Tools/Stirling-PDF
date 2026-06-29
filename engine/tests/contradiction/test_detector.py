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
    _SubjectAlias,
    _SubjectMapping,
)
from stirling.agents.shared.chunked_mapper import ChunkOutput
from stirling.contracts import AiFile
from stirling.contracts.contradiction import ContradictionSeverity
from stirling.contracts.documents import Page, PageRange
from stirling.models import FileId, PrincipalId
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


PRINCIPALS = [PrincipalId("test-user")]


def _install_documents_stub(runtime: AppRuntime, pages_by_id: dict[FileId, list[Page]]) -> None:
    """Patch ``runtime.documents.read_pages`` to return canned pages per file."""

    async def _read(
        collection: FileId,
        principals: list[PrincipalId],
        page_range: PageRange | None = None,
    ) -> list[Page]:
        return pages_by_id.get(collection, [])

    # AppRuntime is frozen; monkey-patch the documents service.
    runtime.documents.read_pages = _read


# Empty / no-pages cases


@pytest.mark.anyio
async def test_no_pages_returns_clean_empty_report(runtime: AppRuntime, file_a: AiFile) -> None:
    _install_documents_stub(runtime, {file_a.id: []})
    detector = ContradictionDetector(runtime)

    report = await detector.detect([file_a], principals=PRINCIPALS)

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
    detector._mapper.map_pages = AsyncMock(return_value=[chunk_output])

    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="deadline", canonical="deadline")]))
    )
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="dates conflict", severity=ContradictionSeverity.ERROR)]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("Examined 2 pages; found 1 contradiction."))

    report = await detector.detect([file_a], principals=PRINCIPALS, query="check the deadline")

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
async def test_zero_claims_returns_clean_report(runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]) -> None:
    """Empty-extractor branch: zero claims → clean report whose
    ``pages_examined`` is still populated from chunk coverage."""
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=_ExtractedClaims(claims=[]), label="pages=1-2")]
    )
    # Stubbing the summary agent is unavoidable (the production code calls
    # it on every detect()); we just don't assert on what it returns.
    # Asserting on the canned value here would only re-prove that AsyncMock
    # works.
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("any text"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    assert report.contradictions == []
    assert report.clean is True
    # The extractor pass ran against both pages even though it produced
    # no claims — they count as examined. This is the load-bearing
    # assertion: pages_examined must come from chunk coverage, not from
    # pages-that-produced-claims.
    assert report.pages_examined == [1, 2]


@pytest.mark.anyio
async def test_canonicaliser_accepts_empty_alias_list(runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]) -> None:
    """A canonicaliser that returns no aliases (e.g. all subjects already
    canonical) is a valid response and must not crash the pipeline."""
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1,
                subject="deadline",
                polarity="assert",
                text="A1",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=2,
                subject="deadline",
                polarity="assert",
                text="A2",
                quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1-2")]
    )
    detector._subject_canonicaliser.run = AsyncMock(return_value=_stub_result(_SubjectMapping(aliases=[])))
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="conflict", severity=ContradictionSeverity.ERROR)]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)
    assert len(report.contradictions) == 1


@pytest.mark.anyio
async def test_canonicaliser_batches_oversized_subject_lists(runtime: AppRuntime) -> None:
    """Regression — when the unique-subject count exceeds the batch size
    the canonicaliser must run multiple parallel calls and merge the
    aliases back into a single mapping. (M7)
    """
    detector = ContradictionDetector(runtime)
    # Settings: batch size is 500; 1200 unique subjects -> 3 batches.
    subjects = [f"subj-{i}" for i in range(1200)]

    call_count = 0

    async def _stub(prompt: str) -> Any:
        nonlocal call_count
        call_count += 1
        # The prompt embeds the JSON payload; extract the subjects it
        # contains so the test mirrors what a real canonicaliser would
        # see, and emit an identity mapping for each one.
        import re

        seen: list[str] = re.findall(r"subj-\d+", prompt)
        return _stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw=s, canonical=s) for s in seen]))

    detector._subject_canonicaliser.run = _stub  # type: ignore[method-assign]

    mapping = await detector._canonicalise_subjects(subjects)

    # 1200 subjects / 500 batch size = ceil = 3 batches.
    assert call_count == 3
    # Every input subject is represented in the merged result.
    assert len(mapping) == 1200
    assert mapping["subj-0"] == "subj-0"
    assert mapping["subj-1199"] == "subj-1199"


@pytest.mark.anyio
async def test_canonicaliser_batch_conflict_resolved_by_lex_min(runtime: AppRuntime) -> None:
    """Regression — if two batches emit different canonicals for the same
    raw subject, the lexicographically smaller canonical wins. (M7)
    """
    detector = ContradictionDetector(runtime)

    call_index = 0

    async def _stub(_prompt: str) -> Any:
        nonlocal call_index
        call_index += 1
        if call_index == 1:
            return _stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="x", canonical="zeta")]))
        return _stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="x", canonical="alpha")]))

    # Force two batches by setting a tiny batch size for the call. We do
    # that by monkey-patching the setting on this detector instance only.
    object.__setattr__(detector._settings, "contradiction_canonicaliser_batch_size", 1)
    detector._subject_canonicaliser.run = _stub  # type: ignore[method-assign]

    mapping = await detector._canonicalise_subjects(["x", "y"])
    # Smaller canonical (lexicographically) wins.
    assert mapping["x"] == "alpha"


def test_subject_alias_rejects_empty_canonical() -> None:
    """The schema must reject ``canonical=""`` so the model can't bypass
    the post-hoc empty-canonical filter by simply emitting empties."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _SubjectAlias(raw="deadline", canonical="")
    with pytest.raises(ValidationError):
        _SubjectAlias(raw="", canonical="deadline")


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(AgentRunError("boom"), id="provider-error"),
        # M6 regression: TimeoutError must also be caught alongside
        # AgentRunError so the canonicaliser falling over does not crash
        # the whole pipeline.
        pytest.param(TimeoutError("simulated"), id="timeout"),
    ],
)
@pytest.mark.anyio
async def test_canonicaliser_failure_falls_back_to_lexical_keys(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page], failure: BaseException
) -> None:
    """When the canonicaliser raises, the ledger keeps its lexical keys
    and the rest of the pipeline still runs. Lexical normalisation
    collapses "Project Deadline" and "the project deadline" into a
    single bucket so a contradiction is still detectable."""
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1,
                subject="Project Deadline",
                polarity="assert",
                text="A1",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=2,
                subject="the project deadline",
                polarity="assert",
                text="A2",
                quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1-2")]
    )
    detector._subject_canonicaliser.run = AsyncMock(side_effect=failure)
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="conflict", severity=ContradictionSeverity.WARNING)]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    # Lexical key collapses both subjects so the bucket still forms.
    assert len(report.contradictions) == 1
    assert report.contradictions[0].severity == ContradictionSeverity.WARNING


@pytest.mark.anyio
async def test_same_page_contradiction_is_surfaced(runtime: AppRuntime, file_a: AiFile) -> None:
    """Two assertions about the same subject on one page can contradict
    each other (e.g. ``deadline March 5`` vs ``deadline April 1``). The
    pipeline must surface them — polarity alone is too coarse a signal
    to drop them silently."""
    pages = [_page(1, "The deadline is March 5. The deadline is April 1.")]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1,
                subject="deadline",
                polarity="assert",
                text="deadline March 5",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=1,
                subject="deadline",
                polarity="assert",
                text="deadline April 1",
                quote="The deadline is April 1.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1], output=extracted_chunk, label="pages=1")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="deadline", canonical="deadline")]))
    )
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[
                    _DetectedPair(
                        i=0,
                        j=1,
                        explanation="Two incompatible deadlines on the same page.",
                        severity=ContradictionSeverity.ERROR,
                    )
                ]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    assert len(report.contradictions) == 1
    assert report.contradictions[0].severity == ContradictionSeverity.ERROR
    assert report.contradictions[0].claim1.page == 1
    assert report.contradictions[0].claim2.page == 1


@pytest.mark.anyio
async def test_identical_quote_pair_is_still_dropped(runtime: AppRuntime, file_a: AiFile) -> None:
    """The surviving post-filter drops pairs whose quotes are byte-identical
    after stripping — those are detector self-pairings, not contradictions."""
    pages = [_page(1, "Shared quote."), _page(2, "Shared quote.")]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(page=1, subject="topic", polarity="assert", text="x", quote="Shared quote."),
            _ExtractedClaim(page=2, subject="topic", polarity="deny", text="y", quote="Shared quote."),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1,2")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="topic", canonical="topic")]))
    )
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="self", severity=ContradictionSeverity.WARNING)]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    assert report.contradictions == []


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(AgentRunError("boom"), id="provider-error"),
        # M6 regression: a TimeoutError from asyncio.wait_for must also fall
        # through to the deterministic summary instead of crashing the pipeline.
        pytest.param(TimeoutError("simulated"), id="timeout"),
    ],
)
@pytest.mark.anyio
async def test_summary_falls_back_to_deterministic_when_llm_unavailable(
    runtime: AppRuntime, file_a: AiFile, pages_a: list[Page], failure: BaseException
) -> None:
    """Both ``AgentRunError`` and ``TimeoutError`` go through the same
    ``except (AgentRunError, TimeoutError)`` handler in ``_generate_summary``
    and produce the deterministic fallback summary."""
    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=_ExtractedClaims(claims=[]), label="pages=1-2")]
    )
    detector._summary_agent.run = AsyncMock(side_effect=failure)

    report = await detector.detect([file_a], principals=PRINCIPALS)

    assert "No contradictions" in report.summary
    assert report.clean is True


@pytest.mark.anyio
async def test_detector_chunk_timeout_falls_through(runtime: AppRuntime, file_a: AiFile, pages_a: list[Page]) -> None:
    """Regression — the per-bucket pair detector run is bounded by
    ``chunked_reasoner_worker_timeout_seconds``. A TimeoutError must not
    crash the pipeline; the bucket's pairs are dropped and we log a
    warning. (M5)
    """

    _install_documents_stub(runtime, {file_a.id: pages_a})
    detector = ContradictionDetector(runtime)

    extracted_chunk = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=1,
                subject="deadline",
                polarity="assert",
                text="A1",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=2,
                subject="deadline",
                polarity="assert",
                text="A2",
                quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2], output=extracted_chunk, label="pages=1-2")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="deadline", canonical="deadline")]))
    )
    detector._pair_detector.run = AsyncMock(side_effect=TimeoutError("simulated"))
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    # Detector timed out so no pairs come back. Crucially: the pipeline
    # reached the summary stage rather than crashing earlier, so
    # ``pages_examined`` is populated from the (successful) extraction
    # stage. A regression where the TimeoutError escapes earlier and a
    # bare except clause builds an empty report would also satisfy
    # ``contradictions == []`` — pinning ``pages_examined`` rules that
    # case out.
    assert report.contradictions == []
    assert report.pages_examined == [1, 2]


@pytest.mark.anyio
async def test_empty_chunk_with_substantial_content_logs_warning(
    runtime: AppRuntime, file_a: AiFile, caplog: pytest.LogCaptureFixture
) -> None:
    """Regression — a chunk whose extraction returned zero claims despite
    carrying >500 chars of source text is suspicious. Log a warning so
    operators can spot quietly broken extractor passes. (M8)
    """
    import logging

    big_text = "x " * 400  # 800 chars
    pages = [_page(1, big_text)]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1], output=_ExtractedClaims(claims=[]), label="pages=1")]
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("ok"))

    with caplog.at_level(logging.WARNING, logger="stirling.agents.contradiction.detector"):
        await detector.detect([file_a], principals=PRINCIPALS)

    assert any(
        "produced 0 claims" in record.getMessage() and "pages=1" in record.getMessage() for record in caplog.records
    )


@pytest.mark.anyio
async def test_pages_examined_includes_every_attempted_page(runtime: AppRuntime, file_a: AiFile) -> None:
    """``pages_examined`` reports the union of every page whose extractor
    pass ran successfully, regardless of whether claims were produced
    for it. A page that the extractor read but found nothing on still
    counts as 'examined' — distinguishing it from a page that was
    skipped or whose chunk failed."""
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
                page=1,
                subject="deadline",
                polarity="assert",
                text="x",
                quote="The deadline is March 5.",
            ),
            _ExtractedClaim(
                page=3,
                subject="deadline",
                polarity="assert",
                text="y",
                quote="The deadline is April 10.",
            ),
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=[1, 2, 3], output=extracted, label="pages=1-3")]
    )
    detector._subject_canonicaliser.run = AsyncMock(return_value=_stub_result(_SubjectMapping(aliases=[])))
    detector._pair_detector.run = AsyncMock(return_value=_stub_result(_BucketContradictions(pairs=[])))
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    # Every page the extractor ran against is reported, even page 2
    # (which produced no claim).
    assert report.pages_examined == [1, 2, 3]


@pytest.mark.anyio
async def test_oversized_bucket_windows_translate_indices_globally(runtime: AppRuntime, file_a: AiFile) -> None:
    """Regression — oversized claim buckets are sliced into overlapping
    windows. Pair indices the model emits are LOCAL to the window; the
    detector must translate them to GLOBAL indices via ``chunk_start``
    before dedup. (M16)

    With ``bucket_chunk_size=12`` and ``overlap=2``, a 15-claim bucket
    yields windows ``[0..11]`` (size 12) and ``[10..14]`` (size 5,
    chunk_start=10). A pair at (i=8, j=11) in window 0 maps to global
    (8, 11); a pair at (i=0, j=4) in window 1 maps to global (10, 14).
    """
    pages = [_page(i, f"claim {i}") for i in range(1, 16)]
    _install_documents_stub(runtime, {file_a.id: pages})
    detector = ContradictionDetector(runtime)

    # 15 claims sharing one canonical subject.
    extracted = _ExtractedClaims(
        claims=[
            _ExtractedClaim(
                page=i,
                subject="deadline",
                polarity="assert",
                text=f"claim text {i}",
                quote=f"claim {i}",
            )
            for i in range(1, 16)
        ]
    )
    detector._mapper.map_pages = AsyncMock(
        return_value=[ChunkOutput(pages=list(range(1, 16)), output=extracted, label="pages=1-15")]
    )
    detector._subject_canonicaliser.run = AsyncMock(
        return_value=_stub_result(_SubjectMapping(aliases=[_SubjectAlias(raw="deadline", canonical="deadline")]))
    )

    window_count = 0

    async def _stub_detector(_prompt: str) -> Any:
        nonlocal window_count
        window_count += 1
        if window_count == 1:
            # First window covers global indices 0..11 — local (i=8, j=11)
            # maps to global (8, 11).
            return _stub_result(
                _BucketContradictions(
                    pairs=[_DetectedPair(i=8, j=11, explanation="window-1 pair", severity=ContradictionSeverity.ERROR)]
                )
            )
        if window_count == 2:
            # Second window covers global indices 10..14 — local (i=0, j=4)
            # maps to global (10, 14).
            return _stub_result(
                _BucketContradictions(
                    pairs=[
                        # Also emit a pair that overlaps with the first
                        # window's pair so the dedup-by-global-index path
                        # is exercised — same global (8, 11) appears as
                        # local (-2, 1) which is out-of-range and dropped.
                        _DetectedPair(i=0, j=4, explanation="window-2 pair", severity=ContradictionSeverity.WARNING),
                    ]
                )
            )
        raise AssertionError(f"unexpected detector window #{window_count}")

    detector._pair_detector.run = _stub_detector  # type: ignore[method-assign]
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("done"))

    report = await detector.detect([file_a], principals=PRINCIPALS)

    # Both windows produced one valid pair each; dedup by global (i, j)
    # leaves exactly two contradictions.
    assert len(report.contradictions) == 2

    pages_pairs = sorted(tuple(sorted((c.claim1.page, c.claim2.page))) for c in report.contradictions)
    # Global (8, 11) → pages (9, 12); global (10, 14) → pages (11, 15).
    assert pages_pairs == [(9, 12), (11, 15)]


def test_dedupe_claims_for_detection_handles_all_cases() -> None:
    """Direct unit tests for the static dedupe helper. (M17)"""
    from stirling.agents.contradiction.detector import ContradictionDetector
    from stirling.contracts.contradiction import Claim

    def _c(*, page: int, quote: str, file_name: str | None) -> Claim:
        return Claim(
            page=page,
            subject="deadline",
            polarity="assert",
            text="paraphrase",
            quote=quote,
            file_name=file_name,
        )

    # Same (file_name, page, normalised quote) → only one survives.
    dupes = [
        _c(page=1, quote="Deadline is March 5.", file_name="a.pdf"),
        _c(page=1, quote="Deadline is March 5.", file_name="a.pdf"),
    ]
    deduped = ContradictionDetector._dedupe_claims_for_detection(dupes)
    assert len(deduped) == 1

    # Same (page, quote) but different file_name → BOTH survive.
    cross_file = [
        _c(page=1, quote="Deadline is March 5.", file_name="a.pdf"),
        _c(page=1, quote="Deadline is March 5.", file_name="b.pdf"),
    ]
    deduped = ContradictionDetector._dedupe_claims_for_detection(cross_file)
    assert len(deduped) == 2

    # Whitespace-only differences in quote → considered the same.
    ws = [
        _c(page=1, quote="Deadline is March 5.", file_name="a.pdf"),
        _c(page=1, quote="  Deadline is March 5.   ", file_name="a.pdf"),
    ]
    deduped = ContradictionDetector._dedupe_claims_for_detection(ws)
    assert len(deduped) == 1

    # Empty (``None``) file_name and ``"x.pdf"`` are treated as different files.
    diff_none = [
        _c(page=1, quote="Deadline is March 5.", file_name=None),
        _c(page=1, quote="Deadline is March 5.", file_name="x.pdf"),
    ]
    deduped = ContradictionDetector._dedupe_claims_for_detection(diff_none)
    assert len(deduped) == 2


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
    detector._subject_canonicaliser.run = AsyncMock(return_value=_stub_result(_SubjectMapping(aliases=[])))
    detector._pair_detector.run = AsyncMock(
        return_value=_stub_result(
            _BucketContradictions(
                pairs=[_DetectedPair(i=0, j=1, explanation="dates conflict", severity=ContradictionSeverity.ERROR)]
            )
        )
    )
    detector._summary_agent.run = AsyncMock(return_value=_stub_result("ok"))

    report = await detector.detect([file_a, file_b], principals=PRINCIPALS)

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
    # ``pages_examined`` MUST count BOTH page-1s (one per file). A bug
    # that collapsed (file, page) to page-number-only would report a
    # single examined page for a 2-file audit. (Aikido finding on
    # PR #6369.)
    assert report.pages_examined == [1, 1]
