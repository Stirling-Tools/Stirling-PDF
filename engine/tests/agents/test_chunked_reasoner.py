"""Tests for ``ChunkedReasoner``: slicing logic, fan-out, and synthesis wiring.

LLM calls are stubbed at the agent boundary; the runtime fixture supplies a
``test`` model so construction succeeds without provider credentials.
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel

from stirling.agents.shared.chunked_reasoner import ChunkedReasoner, ChunkNotes
from stirling.contracts.documents import Page
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
            patch.object(reasoner, "_run_worker", AsyncMock(return_value=canned_notes)) as worker_mock,
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
            patch.object(reasoner, "_run_worker", AsyncMock(return_value=canned_notes)) as worker_mock,
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

        async def _worker(*_args: object, **_kwargs: object) -> ChunkNotes:
            value = async_results.pop(0)
            if isinstance(value, BaseException):
                raise value
            return value

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


# Prompt construction


class TestPromptConstruction:
    def test_worker_prompt_includes_question_and_page_markers(self, runtime: AppRuntime) -> None:
        from stirling.agents.shared.chunked_reasoner import _Slice

        reasoner = ChunkedReasoner(runtime)
        slice_ = _Slice(pages=[_page(2, "page two body"), _page(3, "page three body")])
        prompt = reasoner._build_worker_prompt(slice_, "what is on page two?")

        assert "what is on page two?" in prompt
        assert "[Page 2]" in prompt
        assert "[Page 3]" in prompt
        assert "page two body" in prompt
        assert "Slice covers pages 2 to 3" in prompt

    def test_synthesis_prompt_groups_notes_with_page_labels(self, runtime: AppRuntime) -> None:
        reasoner = ChunkedReasoner(runtime)
        notes = [
            ChunkNotes(pages=[1], summary="single", facts=["f-1"]),
            ChunkNotes(pages=[2, 3, 4], summary="range", relevant_excerpts=["quote-1"]),
        ]
        prompt = reasoner._build_synthesis_prompt("summarise", notes)

        assert "User question:\nsummarise" in prompt
        assert "[Notes from page 1]" in prompt
        assert "[Notes from pages 2-4]" in prompt
        assert "f-1" in prompt
        assert "quote-1" in prompt
