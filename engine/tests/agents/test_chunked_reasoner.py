"""Tests for ``ChunkedReasoner``: slicing logic, fan-out, and synthesis wiring.

LLM calls are stubbed at the agent boundary; the runtime fixture supplies a
``test`` model so construction succeeds without provider credentials.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel

from stirling.agents.shared.chunked_reasoner import ChunkedReasoner, ChunkNotes, _Slice
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
        assert [p.page_number for p in slices[0].pages] == [1, 2, 3]

    def test_starts_new_slice_when_budget_exceeded(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(1, "a" * 6), _page(2, "b" * 6), _page(3, "c" * 6)]
        slices = reasoner._slice_pages(pages)

        # Each page is 6 chars, budget 10 -> two pages would be 12 (over),
        # so the slicer breaks after each page.
        assert [[p.page_number for p in s.pages] for s in slices] == [[1], [2], [3]]

    def test_oversized_page_becomes_its_own_slice(self, runtime: AppRuntime) -> None:
        """A single page larger than the budget is never split. The reasoner
        accepts that this slice exceeds the budget rather than breaking page
        boundaries."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(1, "small"), _page(2, "x" * 100), _page(3, "tiny")]
        slices = reasoner._slice_pages(pages)

        assert [[p.page_number for p in s.pages] for s in slices] == [[1], [2], [3]]

    def test_preserves_input_order(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=1000)
        pages = [_page(i, f"page-{i}") for i in range(1, 11)]
        slices = reasoner._slice_pages(pages)

        flattened = [p.page_number for s in slices for p in s.pages]
        assert flattened == list(range(1, 11))


# End-to-end orchestration


class TestReason:
    @pytest.mark.anyio
    async def test_runs_one_worker_per_slice_and_synthesises(self, runtime: AppRuntime) -> None:
        """Three small pages with a generous budget produce one slice and one worker call;
        the synthesis stage receives notes from all workers and returns the final answer."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=1000)
        pages = [_page(1, "alpha"), _page(2, "beta"), _page(3, "gamma")]

        canned_notes = ChunkNotes(pages=[1, 2, 3], summary="all three pages", facts=["fact-1"])
        canned_answer = _Answer(answer="final answer")

        with (
            patch.object(reasoner, "_run_worker", AsyncMock(return_value=(canned_notes, 0.0))) as worker_mock,
            patch.object(reasoner, "_synthesise", AsyncMock(return_value=canned_answer)) as synth_mock,
        ):
            result = await reasoner.reason(
                pages=pages,
                question="summarise this",
                answer_prompt="answer the question from the notes",
                answer_type=_Answer,
            )

        assert result == canned_answer
        assert worker_mock.await_count == 1
        synth_mock.assert_awaited_once()
        synth_args = synth_mock.await_args
        assert synth_args is not None
        # _synthesise(question, notes, answer_prompt, answer_type)
        _, notes_arg, _, type_arg = synth_args.args
        assert notes_arg == [canned_notes]
        assert type_arg is _Answer

    @pytest.mark.anyio
    async def test_fans_out_when_pages_exceed_slice_budget(self, runtime: AppRuntime) -> None:
        """Pages that don't fit into a single slice produce one worker call per slice."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 6)]

        canned_notes = ChunkNotes(pages=[0], summary="placeholder")
        canned_answer = _Answer(answer="ok")

        with (
            patch.object(reasoner, "_run_worker", AsyncMock(return_value=(canned_notes, 0.0))) as worker_mock,
            patch.object(reasoner, "_synthesise", AsyncMock(return_value=canned_answer)),
        ):
            await reasoner.reason(
                pages=pages,
                question="aggregate",
                answer_prompt="answer",
                answer_type=_Answer,
            )

        # 5 pages, budget 10, each page 8 chars -> 5 slices -> 5 worker calls.
        assert worker_mock.await_count == 5

    @pytest.mark.anyio
    async def test_skips_workers_that_raise_and_continues(self, runtime: AppRuntime) -> None:
        """Worker failures don't sink the run — the synthesiser sees the surviving notes."""
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        good = ChunkNotes(pages=[1], summary="ok")
        async_results = [good, RuntimeError("worker boom"), good]

        async def _worker(*_args: object, **_kwargs: object) -> tuple[ChunkNotes, float]:
            value = async_results.pop(0)
            if isinstance(value, BaseException):
                raise value
            return value, 0.0

        canned_answer = _Answer(answer="resilient")

        with (
            patch.object(reasoner, "_run_worker", AsyncMock(side_effect=_worker)),
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
    async def test_raises_when_every_worker_fails(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 3)]

        with (
            patch.object(reasoner, "_run_worker", AsyncMock(side_effect=RuntimeError("boom"))),
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

        # Each slice's worker awaits a different release event; we release them in
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
            with patch.object(reasoner._worker, "run", AsyncMock(side_effect=_gated_worker)):
                gather_task = asyncio.create_task(reasoner.gather_notes(pages, "anything"))
                await _release_in_reverse()
                notes = await gather_task
        finally:
            reset_progress_emitter(token)

        assert len(notes) == 3
        assert [event.completed for event in emitted] == [1, 2, 3]
        assert all(event.total == 3 for event in emitted)

    @pytest.mark.anyio
    async def test_worker_timeout_is_terminal_for_the_slice(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime, chars_per_slice=10, worker_timeout_seconds=0.05)
        pages = [_page(1, "x" * 8), _page(2, "y" * 8)]
        attempts = 0

        async def _hang_forever(*_args: object, **_kwargs: object) -> _StubAgentResult[ChunkNotes]:
            nonlocal attempts
            attempts += 1
            await asyncio.sleep(10)
            return _StubAgentResult(output=ChunkNotes(pages=[0], summary="never"))

        with (
            patch.object(reasoner._worker, "run", AsyncMock(side_effect=_hang_forever)),
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
    async def test_worker_timeout_drops_stalled_slices(self, runtime: AppRuntime) -> None:
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
            patch.object(reasoner._worker, "run", AsyncMock(side_effect=_hang)),
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
    def test_worker_prompt_includes_question_and_page_markers(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime)
        slice_ = _Slice(pages=[_page(2, "page two body"), _page(3, "page three body")])
        prompt = reasoner._build_worker_prompt(slice_, "what is on page two?")

        assert "what is on page two?" in prompt
        assert "[Page 2]" in prompt
        assert "[Page 3]" in prompt
        assert "page two body" in prompt
        assert "Slice covers pages 2 to 3" in prompt

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
