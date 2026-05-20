"""Tests for ``ChunkedReasoner``: chunking, fan-out, and synthesis wiring.

LLM calls are stubbed at the agent boundary; the runtime fixture supplies a
``test`` model so construction succeeds without provider credentials.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel

from stirling.agents.shared.chunked_mapper import _ChunkExtraction
from stirling.agents.shared.chunked_reasoner import ChunkedReasoner, ChunkNotes
from stirling.contracts import WholeDocSliceDone
from stirling.contracts.documents import Page
from stirling.services import reset_progress_emitter, set_progress_emitter
from stirling.services.runtime import AppRuntime


@dataclass
class _StubAgentResult[T]:
    output: T


class _Answer(BaseModel):
    answer: str


def _page(n: int, text: str) -> Page:
    return Page(page_number=n, text=text, char_count=len(text))


# Slicing logic


class TestSlicePages:
    """``_slice_pages`` is pure: no model calls, no I/O."""

    def test_groups_consecutive_pages_under_budget(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=20)
        pages = [_page(1, "abc"), _page(2, "defgh"), _page(3, "ij")]
        slices = reasoner._slice_pages(pages)

        assert len(slices) == 1
        assert [p.page_number for p in slices[0]] == [1, 2, 3]

    def test_starts_new_slice_when_budget_exceeded(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(1, "a" * 6), _page(2, "b" * 6), _page(3, "c" * 6)]
        slices = reasoner._slice_pages(pages)

        # Each page is 6 chars, budget 10 -> two pages would be 12 (over),
        # so the slicer breaks after each page.
        assert [[p.page_number for p in s] for s in slices] == [[1], [2], [3]]

    def test_oversized_page_becomes_its_own_slice(self, runtime: AppRuntime) -> None:
        """A single page larger than the budget is never split. The reasoner
        accepts that this slice exceeds the budget rather than breaking page
        boundaries."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(1, "small"), _page(2, "x" * 100), _page(3, "tiny")]
        slices = reasoner._slice_pages(pages)

        assert [[p.page_number for p in s] for s in slices] == [[1], [2], [3]]

    def test_preserves_input_order(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=1000)
        pages = [_page(i, f"page-{i}") for i in range(1, 11)]
        slices = reasoner._slice_pages(pages)

        flattened = [p.page_number for s in slices for p in s]
        assert flattened == list(range(1, 11))


# End-to-end orchestration


class TestReason:
    @pytest.mark.anyio
    async def test_runs_one_chunk_per_slice_and_synthesises(self, runtime: AppRuntime) -> None:
        """Three small pages with a generous budget produce one chunk and one extractor call;
        the synthesis stage receives notes from all chunks and returns the final answer."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=1000)
        pages = [_page(1, "alpha"), _page(2, "beta"), _page(3, "gamma")]

        canned_extracted = _ExtractedNotes(summary="all three pages", facts=["fact-1"])
        canned_answer = _Answer(answer="final answer")

        with (
            patch.object(
                reasoner._mapper,
                "_extract_chunk",
                AsyncMock(return_value=_ChunkExtraction(output=canned_extracted, duration_seconds=0.0)),
            ) as chunk_mock,
            patch.object(reasoner, "_synthesise", AsyncMock(return_value=canned_answer)) as synth_mock,
        ):
            result = await reasoner.reason(
                pages=pages,
                question="summarise this",
                answer_prompt="answer the question from the notes",
                answer_type=_Answer,
            )

        assert result == canned_answer
        assert chunk_mock.await_count == 1
        synth_mock.assert_awaited_once()
        synth_args = synth_mock.await_args
        assert synth_args is not None
        # _synthesise(question, notes, answer_prompt, answer_type)
        _, notes_arg, _, type_arg = synth_args.args
        assert len(notes_arg) == 1
        assert notes_arg[0].pages == [1, 2, 3]
        assert notes_arg[0].summary == "all three pages"
        assert notes_arg[0].facts == ["fact-1"]
        assert type_arg is _Answer

    @pytest.mark.anyio
    async def test_fans_out_when_pages_exceed_slice_budget(self, runtime: AppRuntime) -> None:
        """Pages that don't fit into a single slice produce one extractor call per slice."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 6)]

        canned_extracted = _ExtractedNotes(summary="placeholder")
        canned_answer = _Answer(answer="ok")

        with (
            patch.object(
                reasoner._mapper,
                "_extract_chunk",
                AsyncMock(return_value=_ChunkExtraction(output=canned_extracted, duration_seconds=0.0)),
            ) as chunk_mock,
            patch.object(reasoner, "_synthesise", AsyncMock(return_value=canned_answer)),
        ):
            await reasoner.reason(
                pages=pages,
                question="aggregate",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        # 5 pages, budget 10, each page 8 chars -> 5 slices -> 5 chunk calls.
        assert chunk_mock.await_count == 5

    @pytest.mark.anyio
    async def test_skips_first_round_chunks_that_raise_and_continues(self, runtime: AppRuntime) -> None:
        """First-round chunks have no fallback notes, so a failure is dropped
        rather than preserving anything; the surviving notes still flow into
        synthesis."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        good = _ExtractedNotes(summary="ok")
        async_results: list[_ExtractedNotes | BaseException] = [good, RuntimeError("chunk boom"), good]

        async def _chunk(*_args: object, **_kwargs: object) -> _ChunkExtraction[_ExtractedNotes]:
            value = async_results.pop(0)
            if isinstance(value, BaseException):
                raise value
            return _ChunkExtraction(output=value, duration_seconds=0.0)

        canned_answer = _Answer(answer="resilient")

        with (
            patch.object(reasoner._mapper, "_extract_chunk", AsyncMock(side_effect=_chunk)),
            patch.object(reasoner, "_synthesise", AsyncMock(return_value=canned_answer)) as synth_mock,
        ):
            result = await reasoner.reason(
                pages=pages,
                question="aggregate",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        assert result == canned_answer
        synth_args = synth_mock.await_args
        assert synth_args is not None
        _, notes_arg, _, _ = synth_args.args
        assert len(notes_arg) == 2

    @pytest.mark.anyio
    async def test_raises_when_every_first_round_chunk_fails(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 3)]

        with (
            patch.object(reasoner._mapper, "_extract_chunk", AsyncMock(side_effect=RuntimeError("boom"))),
            patch.object(reasoner, "_synthesise", AsyncMock()) as synth_mock,
            pytest.raises(RuntimeError, match="no notes"),
        ):
            await reasoner.reason(
                pages=pages,
                question="anything",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        synth_mock.assert_not_awaited()

    @pytest.mark.anyio
    async def test_rejects_empty_pages(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime)
        with pytest.raises(ValueError, match="at least one page"):
            await reasoner.reason(
                pages=[],
                question="x",
                answer_prompt="y",
                answer_type=_Answer,
            )

    @pytest.mark.anyio
    async def test_progress_events_carry_monotonic_completion_counter(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        # Each chunk's worker awaits a different release event; we release them in
        # reverse order so completion order is the inverse of slice order.
        release_events = [asyncio.Event() for _ in pages]
        next_call_index = 0

        async def _gated_worker(*_args: object, **_kwargs: object) -> _StubAgentResult[ChunkNotes]:
            nonlocal next_call_index
            this_call = next_call_index
            next_call_index += 1
            await release_events[this_call].wait()
            return _StubAgentResult(output=ChunkNotes(pages=[this_call + 1], summary=f"slice-{this_call}"))

        emitted: list[WholeDocSliceDone] = []

        async def _capture_emitter(event: object) -> None:
            if isinstance(event, WholeDocSliceDone):
                emitted.append(event)

        async def _release_in_reverse() -> None:
            # Wait briefly so all three worker tasks are blocked on their events
            # before we start releasing them.
            await asyncio.sleep(0)
            for ev in reversed(release_events):
                ev.set()
                # Yield so the just-released worker can run to completion before
                # we release the next one — keeps ordering deterministic.
                await asyncio.sleep(0)
                await asyncio.sleep(0)

        token = set_progress_emitter(_capture_emitter)
        try:
            with patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_gated_worker)):
                gather_task = asyncio.create_task(reasoner.gather_notes(pages, "anything"))
                await _release_in_reverse()
                notes = await gather_task
        finally:
            reset_progress_emitter(token)

        assert len(notes) == 3
        assert [event.completed for event in emitted] == [1, 2, 3]
        assert all(event.total == 3 for event in emitted)

    @pytest.mark.anyio
    async def test_worker_timeout_is_terminal_for_the_chunk(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10, worker_timeout_seconds=0.05)
        pages = [_page(1, "x" * 8), _page(2, "y" * 8)]
        attempts = 0

        async def _hang_forever(*_args: object, **_kwargs: object) -> _StubAgentResult[ChunkNotes]:
            nonlocal attempts
            attempts += 1
            await asyncio.sleep(10)
            return _StubAgentResult(output=ChunkNotes(pages=[0], summary="never"))

        with (
            patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_hang_forever)),
            patch.object(reasoner, "_synthesise", AsyncMock()) as synth_mock,
            pytest.raises(RuntimeError, match="no notes"),
        ):
            await reasoner.reason(
                pages=pages,
                question="anything",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        # One attempt per slice; no retry path.
        assert attempts == len(pages)
        synth_mock.assert_not_awaited()

    @pytest.mark.anyio
    async def test_worker_timeout_drops_stalled_chunks(self, runtime: AppRuntime) -> None:
        """A worker that exceeds ``worker_timeout_seconds`` is abandoned, not awaited.

        Without this guard one stuck upstream call would pin gather_notes to its
        provider HTTP timeout (~10 minutes), starving the orchestrator request.
        """
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10, worker_timeout_seconds=0.05)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        async def _hang(*_args: object, **_kwargs: object) -> _StubAgentResult[ChunkNotes]:
            await asyncio.sleep(10)
            return _StubAgentResult(output=ChunkNotes(pages=[0], summary="never"))

        with (
            patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_hang)),
            patch.object(reasoner, "_synthesise", AsyncMock()) as synth_mock,
            pytest.raises(RuntimeError, match="no notes"),
        ):
            await reasoner.reason(
                pages=pages,
                question="anything",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        synth_mock.assert_not_awaited()


# Prompt construction


class TestPromptConstruction:
    def test_extraction_prompt_includes_question_and_page_markers(self, runtime: AppRuntime) -> None:
        """A first-round chunk's content carries ``[Page N]`` markers; the
        extraction prompt prepends the user question."""
        from stirling.agents.shared.chunked_mapper import ChunkedMapper

        reasoner = ChunkedReasoner(runtime)
        # Render chunk content through the mapper's public helper — the
        # first-round chunk shape lives in ChunkedMapper.
        content = ChunkedMapper.format_chunk_content([_page(2, "page two body"), _page(3, "page three body")])
        prompt = reasoner._build_extraction_prompt(content, "what is on page two?")

        assert "what is on page two?" in prompt
        assert "[Page 2]" in prompt
        assert "[Page 3]" in prompt
        assert "page two body" in prompt

    def test_format_notes_groups_by_page_label(self) -> None:
        notes = [
            ChunkNotes(pages=[1], summary="single", facts=["f-1"]),
            ChunkNotes(pages=[2, 3, 4], summary="range", relevant_excerpts=["quote-1"]),
        ]
        rendered = ChunkedReasoner.format_notes(notes)

        assert "[Notes from page 1]" in rendered
        assert "[Notes from pages 2-4]" in rendered
        assert "f-1" in rendered
        assert "quote-1" in rendered


# Hierarchical compression
#
# The compression loop is part of ``_compress_until_fits`` /
# ``_run_compression_round`` and isn't exposed directly, so these tests
# drive it end-to-end via ``gather_notes`` with a stubbed extractor that
# controls per-call output (and per-call failure patterns) by counting
# calls.


class TestCompression:
    @pytest.mark.anyio
    async def test_no_compression_when_under_budget(self, runtime: AppRuntime) -> None:
        """First-round notes that already fit the budget result in zero
        compression rounds: the only extractor calls are one per slice."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=200, notes_char_budget=10_000)
        pages = [_page(i, "x" * 150) for i in range(1, 5)]  # each page exceeds slice budget alone -> 4 slices

        canned = _ExtractedNotes(summary="ok")
        with patch.object(
            reasoner._extractor,
            "run",
            AsyncMock(return_value=_StubAgentResult(output=canned)),
        ) as ext_mock:
            notes = await reasoner.gather_notes(pages, "anything")

        assert ext_mock.await_count == 4
        assert len(notes) == 4

    @pytest.mark.anyio
    async def test_runs_compression_when_over_budget(self, runtime: AppRuntime) -> None:
        """When first-round notes overflow the budget, the loop regroups them
        and runs the extractor again. Output is shorter than input; pages from
        every input slice survive in the consolidated notes."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=200, notes_char_budget=200)
        pages = [_page(i, "x" * 150) for i in range(1, 5)]

        call_count = 0

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[object]:
            nonlocal call_count
            call_count += 1
            if call_count <= 4:
                # Round 1: each note ~80 chars rendered. 4 * 80 = 320 chars, over the 200 budget.
                return _StubAgentResult(output=_ExtractedNotes(summary="x" * 60))
            # Round 2: smaller note so the post-round set fits the budget.
            return _StubAgentResult(output=_ExtractedNotes(summary="ok"))

        with patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_stub)) as ext_mock:
            notes = await reasoner.gather_notes(pages, "anything")

        # 4 first-round + 2 compression-round calls = 6 total.
        assert ext_mock.await_count == 6
        # Compressed from 4 notes to 2.
        assert len(notes) == 2
        # Pages from every original slice are preserved through compression.
        assert sorted({p for n in notes for p in n.pages}) == [1, 2, 3, 4]

    @pytest.mark.anyio
    async def test_compression_preserves_input_notes_when_a_group_fails(self, runtime: AppRuntime) -> None:
        """A compression chunk that raises has its input notes carried forward
        rather than dropped, so page coverage isn't silently lost. The
        succeeding chunk is replaced by its consolidated note.

        Budget is sized so the post-round survivors (2 preserved + 1
        consolidated) fit, leaving a single compression round as the
        observable interaction."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=200, notes_char_budget=300)
        pages = [_page(i, "x" * 150) for i in range(1, 5)]

        call_count = 0

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[object]:
            nonlocal call_count
            call_count += 1
            if call_count <= 4:
                return _StubAgentResult(output=_ExtractedNotes(summary="x" * 60))
            if call_count == 5:
                # The first compression call (covering 2 of the round-1 notes) fails.
                raise RuntimeError("compression group fails")
            return _StubAgentResult(output=_ExtractedNotes(summary="ok"))

        with patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_stub)):
            notes = await reasoner.gather_notes(pages, "anything")

        # 2 preserved round-1 notes + 1 consolidated note = 3 notes total. Pages
        # from every original slice are still covered (preservation worked).
        assert len(notes) == 3
        assert sorted({p for n in notes for p in n.pages}) == [1, 2, 3, 4]

        consolidated = [n for n in notes if n.summary == "ok"]
        preserved = [n for n in notes if n.summary.startswith("x")]
        assert len(consolidated) == 1
        assert len(preserved) == 2

    @pytest.mark.anyio
    async def test_compression_bails_when_every_group_fails(self, runtime: AppRuntime) -> None:
        """If every chunk in a compression round fails, every input note is
        preserved (none consolidated). The loop exits rather than retrying
        the same shape forever."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime, chars_per_slice=200, notes_char_budget=200)
        pages = [_page(i, "x" * 150) for i in range(1, 5)]

        call_count = 0

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[object]:
            nonlocal call_count
            call_count += 1
            if call_count <= 4:
                return _StubAgentResult(output=_ExtractedNotes(summary="x" * 60))
            raise RuntimeError("compression always fails")

        with patch.object(reasoner._extractor, "run", AsyncMock(side_effect=_stub)):
            notes = await reasoner.gather_notes(pages, "anything")

        # All 4 round-1 notes preserved through the bailed compression round.
        assert len(notes) == 4
        assert sorted({p for n in notes for p in n.pages}) == [1, 2, 3, 4]


class TestGroupNotesForCompression:
    """``_group_notes_for_compression`` is pure and packs by rendered char count."""

    def test_packs_consecutive_notes_under_budget(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10_000)
        notes = [ChunkNotes(pages=[i], summary=f"s-{i}") for i in range(1, 5)]

        groups = reasoner._group_notes_for_compression(notes)

        assert len(groups) == 1
        assert [n.pages[0] for n in groups[0]] == [1, 2, 3, 4]

    def test_starts_new_group_when_budget_exceeded(self, runtime: AppRuntime) -> None:
        """Each note already exceeds the per-group budget, so each becomes its
        own group; this matches how slice-pages handles oversize pages."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=5)
        notes = [ChunkNotes(pages=[i], summary=f"slice-{i}-with-prose-to-fill-space") for i in range(1, 5)]

        groups = reasoner._group_notes_for_compression(notes)

        assert [[n.pages[0] for n in g] for g in groups] == [[1], [2], [3], [4]]


class TestExtractChunk:
    @pytest.mark.anyio
    async def test_pages_are_unioned_for_compression_chunks(self, runtime: AppRuntime) -> None:
        """A compression chunk's resulting note carries the union of input pages.
        The model output schema doesn't include pages, so the wrapper is the
        single source of truth."""
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        reasoner = ChunkedReasoner(runtime)
        group = [
            ChunkNotes(pages=[1, 2], summary="a"),
            ChunkNotes(pages=[3], summary="b"),
            ChunkNotes(pages=[4, 5], summary="c"),
        ]
        chunk = reasoner._chunk_from_notes(group)
        canned = _ExtractedNotes(summary="merged", facts=["x"], relevant_excerpts=["y"])

        with patch.object(
            reasoner._extractor,
            "run",
            AsyncMock(return_value=_StubAgentResult(output=canned)),
        ):
            extraction = await reasoner._extract_compression_chunk(chunk, "compress these")

        note = extraction.output
        assert note.pages == [1, 2, 3, 4, 5]
        assert note.summary == "merged"
        assert note.facts == ["x"]
        assert note.relevant_excerpts == ["y"]
        assert extraction.duration_seconds >= 0

    @pytest.mark.anyio
    async def test_compression_rounds_receive_user_question_through_gather_notes(self, runtime: AppRuntime) -> None:
        """Regression — every extractor call (first round AND every
        compression round) MUST carry the same user question. The pre-fix
        bug passed ``""`` to the compression-round prompt builder, so the
        model consolidated notes against different relevance criteria
        than it extracted them under. Flagged by Aikido on PR #6369;
        pinned end-to-end here by capturing every prompt the extractor
        sees while ``gather_notes`` forces a compression round through a
        tight notes budget.
        """
        from stirling.agents.shared.chunked_reasoner import _ExtractedNotes

        # Small notes budget forces a compression round; small slice
        # budget produces multiple first-round chunks that overflow it.
        reasoner = ChunkedReasoner(runtime, chars_per_slice=200, notes_char_budget=200)
        pages = [_page(i, "x" * 150) for i in range(1, 5)]

        call_count = 0

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[object]:
            nonlocal call_count
            call_count += 1
            if call_count <= 4:
                # Round 1: each note ~60 chars rendered. 4 * 80 = 320 chars,
                # over the 200 budget so a compression round must fire.
                return _StubAgentResult(output=_ExtractedNotes(summary="x" * 60))
            # Round 2: smaller note so the post-round set fits the budget.
            return _StubAgentResult(output=_ExtractedNotes(summary="ok"))

        seen_prompts: list[str] = []

        async def _capture(prompt: str, *_a: Any, **_kw: Any) -> Any:
            seen_prompts.append(prompt)
            return await _stub()

        with patch.object(reasoner._extractor, "run", side_effect=_capture):
            await reasoner.gather_notes(pages, "what is the deadline?")

        # At least four first-round calls plus the compression-round
        # calls — every single one must carry the user question.
        assert len(seen_prompts) >= 5
        for prompt in seen_prompts:
            assert "what is the deadline?" in prompt
