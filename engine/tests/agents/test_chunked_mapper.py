"""Tests for the generic ``ChunkedMapper`` primitive.

The mapper is the per-chunk fan-out machinery extracted from
``ChunkedReasoner``: char-budgeted slicing, parallel scheduling under a
semaphore, time-bounded extraction with cancellation, progress events, and
worker-failure tolerance. These tests drive it with a stubbed
``Agent[None, T]`` so the model boundary stays patched out.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent

from stirling.agents.shared.chunked_mapper import ChunkedMapper
from stirling.contracts.documents import Page
from stirling.services.runtime import AppRuntime


@dataclass
class _StubAgentResult[T]:
    output: T


class _Extracted(BaseModel):
    """Tiny per-chunk extractor payload used by these tests."""

    label: str


def _page(n: int, text: str) -> Page:
    return Page(page_number=n, text=text, char_count=len(text))


def _build_mapper(
    runtime: AppRuntime,
    *,
    chars_per_slice: int | None = None,
    concurrency: int | None = None,
    worker_timeout_seconds: float | None = None,
) -> ChunkedMapper[_Extracted]:
    """Build a mapper wrapping a real ``Agent`` whose ``.run`` is patched per test."""
    extractor: Agent[None, _Extracted] = Agent(
        model=runtime.fast_model,
        output_type=_Extracted,
        model_settings=runtime.fast_model_settings,
    )
    return ChunkedMapper(
        runtime,
        extractor=extractor,
        chars_per_slice=chars_per_slice,
        concurrency=concurrency,
        worker_timeout_seconds=worker_timeout_seconds,
    )


class TestSlicePages:
    """The static helper is pure: no I/O, no scheduling."""

    def test_single_slice_when_under_budget(self) -> None:
        pages = [_page(1, "abc"), _page(2, "def"), _page(3, "gh")]
        slices = ChunkedMapper.slice_pages(pages, chars_per_slice=20)

        assert [[p.page_number for p in s] for s in slices] == [[1, 2, 3]]

    def test_starts_new_slice_when_budget_exceeded(self) -> None:
        pages = [_page(1, "a" * 6), _page(2, "b" * 6), _page(3, "c" * 6)]
        slices = ChunkedMapper.slice_pages(pages, chars_per_slice=10)

        # 6 + 6 > 10 → break after each page
        assert [[p.page_number for p in s] for s in slices] == [[1], [2], [3]]

    def test_oversized_page_is_its_own_slice(self) -> None:
        """Page boundaries are never broken: an oversize page becomes its own slice."""
        pages = [_page(1, "small"), _page(2, "x" * 100), _page(3, "tiny")]
        slices = ChunkedMapper.slice_pages(pages, chars_per_slice=10)

        assert [[p.page_number for p in s] for s in slices] == [[1], [2], [3]]

    def test_rejects_non_positive_budget(self) -> None:
        with pytest.raises(ValueError, match="chars_per_slice"):
            ChunkedMapper.slice_pages([_page(1, "x")], chars_per_slice=0)


class TestFormatChunkContent:
    def test_renders_page_markers(self) -> None:
        rendered = ChunkedMapper.format_chunk_content([_page(2, "two"), _page(3, "three")])

        assert "[Page 2]\ntwo" in rendered
        assert "[Page 3]\nthree" in rendered
        # Blank-line separator between pages
        assert "two\n\n[Page 3]" in rendered


class TestMapPages:
    @pytest.mark.anyio
    async def test_single_chunk_returns_single_output(self, runtime: AppRuntime) -> None:
        mapper = _build_mapper(runtime, chars_per_slice=1000)
        pages = [_page(1, "alpha"), _page(2, "beta"), _page(3, "gamma")]

        canned = _Extracted(label="one")
        with patch.object(
            mapper._extractor,
            "run",
            AsyncMock(return_value=_StubAgentResult(output=canned)),
        ) as run_mock:
            outputs = await mapper.map_pages(pages, "what")

        assert run_mock.await_count == 1
        assert len(outputs) == 1
        assert outputs[0].pages == [1, 2, 3]
        assert outputs[0].output == canned
        assert outputs[0].label == "pages=1-3"

    @pytest.mark.anyio
    async def test_multi_chunk_outputs_are_in_document_order(self, runtime: AppRuntime) -> None:
        """Outputs are sorted by first covered page regardless of completion order."""
        mapper = _build_mapper(runtime, chars_per_slice=10, concurrency=3)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        # Each chunk's worker awaits a release event; we release in reverse
        # order so completion order is the inverse of slice order.
        release = [asyncio.Event() for _ in pages]
        call_index = 0

        async def _gated(*_args: object, **_kwargs: object) -> _StubAgentResult[_Extracted]:
            nonlocal call_index
            mine = call_index
            call_index += 1
            await release[mine].wait()
            return _StubAgentResult(output=_Extracted(label=f"slice-{mine + 1}"))

        async def _release_in_reverse() -> None:
            await asyncio.sleep(0)
            for ev in reversed(release):
                ev.set()
                await asyncio.sleep(0)
                await asyncio.sleep(0)

        with patch.object(mapper._extractor, "run", AsyncMock(side_effect=_gated)):
            task = asyncio.create_task(mapper.map_pages(pages, "anything"))
            await _release_in_reverse()
            outputs = await task

        assert [o.pages for o in outputs] == [[1], [2], [3]]

    @pytest.mark.anyio
    async def test_worker_failure_drops_only_that_chunk(self, runtime: AppRuntime) -> None:
        mapper = _build_mapper(runtime, chars_per_slice=10)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        results: list[_Extracted | BaseException] = [
            _Extracted(label="a"),
            RuntimeError("boom"),
            _Extracted(label="c"),
        ]

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[_Extracted]:
            value = results.pop(0)
            if isinstance(value, BaseException):
                raise value
            return _StubAgentResult(output=value)

        with patch.object(mapper._extractor, "run", AsyncMock(side_effect=_stub)):
            outputs = await mapper.map_pages(pages, "anything")

        assert len(outputs) == 2
        assert {o.output.label for o in outputs} == {"a", "c"}

    @pytest.mark.anyio
    async def test_worker_timeout_drops_only_that_chunk(self, runtime: AppRuntime) -> None:
        mapper = _build_mapper(runtime, chars_per_slice=10, worker_timeout_seconds=0.05)
        pages = [_page(i, "x" * 8) for i in range(1, 4)]

        async def _stub(*_args: object, **_kwargs: object) -> _StubAgentResult[_Extracted]:
            # Page 2 hangs forever; pages 1 and 3 return immediately.
            prompt = _args[0]
            assert isinstance(prompt, str)
            if "[Page 2]" in prompt:
                await asyncio.sleep(10)
            return _StubAgentResult(output=_Extracted(label="ok"))

        with patch.object(mapper._extractor, "run", AsyncMock(side_effect=_stub)):
            outputs = await mapper.map_pages(pages, "anything")

        covered = sorted({p for o in outputs for p in o.pages})
        assert covered == [1, 3]

    @pytest.mark.anyio
    async def test_outer_cancellation_drains_pending_tasks(self, runtime: AppRuntime) -> None:
        """Cancellation propagating in from upstream cancels per-chunk model
        calls rather than letting them keep billing tokens."""
        mapper = _build_mapper(runtime, chars_per_slice=10, concurrency=5)
        pages = [_page(i, "x" * 8) for i in range(1, 5)]

        cancellations = 0

        async def _hang(*_args: object, **_kwargs: object) -> _StubAgentResult[_Extracted]:
            nonlocal cancellations
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                cancellations += 1
                raise
            return _StubAgentResult(output=_Extracted(label="never"))

        with patch.object(mapper._extractor, "run", AsyncMock(side_effect=_hang)):
            task = asyncio.create_task(mapper.map_pages(pages, "anything"))
            # Yield once so all four workers are blocked on their sleep.
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

        assert cancellations == len(pages)

    @pytest.mark.anyio
    async def test_semaphore_caps_concurrency(self, runtime: AppRuntime) -> None:
        """At most ``concurrency`` workers run at once; with strictly more work
        items than slots the observed max is exactly the configured cap."""
        concurrency = 2
        mapper = _build_mapper(runtime, chars_per_slice=10, concurrency=concurrency)
        pages = [_page(i, "x" * 8) for i in range(1, 6)]  # 5 items > 2 slots

        active = 0
        peak = 0

        async def _track(*_args: object, **_kwargs: object) -> _StubAgentResult[_Extracted]:
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            # Yield enough times that other waiters get a chance to enter.
            for _ in range(5):
                await asyncio.sleep(0)
            active -= 1
            return _StubAgentResult(output=_Extracted(label="ok"))

        with patch.object(mapper._extractor, "run", AsyncMock(side_effect=_track)):
            outputs = await mapper.map_pages(pages, "anything")

        assert len(outputs) == 5
        assert peak == concurrency

    @pytest.mark.anyio
    async def test_rejects_empty_pages(self, runtime: AppRuntime) -> None:
        mapper = _build_mapper(runtime)
        with pytest.raises(ValueError, match="at least one page"):
            await mapper.map_pages([], "anything")


class TestSummaryCounts:
    """``summary_counts`` callback feeds the WholeDocSliceDone event's
    excerpts/facts counters from the consumer's extractor output shape
    without the mapper itself duck-typing fields on ``T``."""

    @pytest.mark.anyio
    async def test_default_callback_emits_zero_counts(self, runtime: AppRuntime) -> None:
        """No callback supplied → events emit ``excerpts=0 facts=0``."""
        from stirling.contracts import WholeDocSliceDone
        from stirling.services import reset_progress_emitter, set_progress_emitter

        mapper = _build_mapper(runtime, chars_per_slice=1000)
        pages = [_page(1, "small")]
        canned = _Extracted(label="ok")

        emitted: list[WholeDocSliceDone] = []

        async def _emit(event: object) -> None:
            if isinstance(event, WholeDocSliceDone):
                emitted.append(event)

        token = set_progress_emitter(_emit)
        try:
            with patch.object(
                mapper._extractor,
                "run",
                AsyncMock(return_value=_StubAgentResult(output=canned)),
            ):
                await mapper.map_pages(pages, "q")
        finally:
            reset_progress_emitter(token)

        assert len(emitted) == 1
        assert emitted[0].excerpts == 0
        assert emitted[0].facts == 0

    @pytest.mark.anyio
    async def test_user_callback_drives_counts(self, runtime: AppRuntime) -> None:
        """A supplied callback receives each chunk's typed output and its
        returned tuple is what the event carries."""
        from stirling.contracts import WholeDocSliceDone
        from stirling.services import reset_progress_emitter, set_progress_emitter

        captured: list[_Extracted] = []

        def _counts(output: _Extracted) -> tuple[int, int]:
            captured.append(output)
            return (3, 7)

        extractor: Agent[None, _Extracted] = Agent(
            model=runtime.fast_model,
            output_type=_Extracted,
            model_settings=runtime.fast_model_settings,
        )
        mapper: ChunkedMapper[_Extracted] = ChunkedMapper(
            runtime,
            extractor=extractor,
            chars_per_slice=1000,
            summary_counts=_counts,
        )
        canned = _Extracted(label="ok")

        emitted: list[WholeDocSliceDone] = []

        async def _emit(event: object) -> None:
            if isinstance(event, WholeDocSliceDone):
                emitted.append(event)

        token = set_progress_emitter(_emit)
        try:
            with patch.object(
                mapper._extractor,
                "run",
                AsyncMock(return_value=_StubAgentResult(output=canned)),
            ):
                await mapper.map_pages([_page(1, "small")], "q")
        finally:
            reset_progress_emitter(token)

        assert len(captured) == 1
        assert captured[0].label == "ok"
        assert emitted[0].excerpts == 3
        assert emitted[0].facts == 7


class TestChunkOutputShape:
    @pytest.mark.anyio
    async def test_single_page_label(self, runtime: AppRuntime) -> None:
        mapper = _build_mapper(runtime, chars_per_slice=5)
        pages = [_page(7, "x" * 6)]  # one oversize page → one slice
        canned = _Extracted(label="solo")

        with patch.object(
            mapper._extractor,
            "run",
            AsyncMock(return_value=_StubAgentResult(output=canned)),
        ):
            outputs = await mapper.map_pages(pages, "q")

        assert outputs[0].label == "pages=7"
