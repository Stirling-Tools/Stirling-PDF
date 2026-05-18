"""Parallel chunked map primitive over long documents.

A generic primitive for any agent that needs to run a per-chunk extractor over
every page of a document. The document is split into character-budgeted chunks
(page boundaries preserved); each chunk is fed to a caller-supplied
``Agent[None, T]`` extractor in parallel under a semaphore; the typed outputs
are collected into ``ChunkOutput[T]`` records, sorted into document order, and
returned.

``ChunkedReasoner`` is the canonical consumer for question-answering. Other
agents that need typed per-chunk extraction (e.g. contradiction surfacing,
claim extraction) construct their own ``Agent[None, T]`` and feed it through
the same scheduling/timeout/cancellation machinery via this class.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel
from pydantic_ai import Agent

from stirling.contracts import (
    WholeDocReadDone,
    WholeDocReadStarted,
    WholeDocSliceDone,
)
from stirling.contracts.documents import Page
from stirling.services import AppRuntime, emit_progress

logger = logging.getLogger(__name__)


# Per-page marker rendered by :meth:`ChunkedMapper.format_chunk_content`.
# Consumed by downstream extractor prompts (e.g. the contradiction agent's
# claim-extractor prompt) so the shape can be changed in one place if the
# format ever needs to evolve.
PAGE_MARKER_TEMPLATE = "[Page {n}]"


@dataclass(frozen=True)
class ChunkOutput[T: BaseModel]:
    """One chunk's worth of typed extractor output, plus the pages it covered.

    Returned in document order (sorted by first page). Workers that failed
    produce no ChunkOutput; the wrapper logs and drops them. Callers that care
    about full coverage should check returned ChunkOutputs cover their expected
    pages.

    ``label`` is a short ``"pages=3-7"`` descriptor used in logs and progress
    events.
    """

    pages: list[int]
    output: T
    label: str


@dataclass(frozen=True)
class _MapperChunk:
    """A unit of work for the extractor: rendered content + the pages it covers.

    ``content`` is the formatted text fed to the model (raw page text with
    ``[Page N]`` markers by default). ``pages`` is attached to the resulting
    :class:`ChunkOutput` deterministically — the model never reports page
    coverage.
    """

    content: str
    pages: list[int]
    label: str


@dataclass(frozen=True)
class _ChunkExtraction[T: BaseModel]:
    """Result of a single chunk extractor call.

    Carries the typed extractor output and the wall-clock duration so the
    scheduler can populate progress events and the "slowest chunk" log line.
    Duration is in seconds (matches :func:`time.perf_counter` semantics);
    the unit is in the field name so callers can't misread it as
    milliseconds.

    Internal helper — exported privately to ``chunked_reasoner.py`` so its
    own compression-round scheduler can use the same shape.
    """

    output: T
    duration_seconds: float


def _page_range_label(pages: list[Page]) -> str:
    if not pages:
        return "pages=?"
    if len(pages) == 1:
        return f"pages={pages[0].page_number}"
    return f"pages={pages[0].page_number}-{pages[-1].page_number}"


def _default_build_prompt(content: str, query: str) -> str:
    """Default extraction prompt shape: query then content.

    The same shape used historically by ChunkedReasoner so existing consumers
    don't change behaviour. Callers with different prompt needs (e.g. system-
    prompt-only extractors) can supply their own ``build_prompt``.
    """
    return f"User question:\n{query}\n\nContent:\n{content}"


class ChunkedMapper[T: BaseModel]:
    """Parallel chunked map: pages -> list[T] via a caller-supplied extractor.

    Char-budgeted multi-page slicing; one extractor call per slice under a
    semaphore. Time-bounded; honours upstream cancellation. Emits progress
    events as each chunk completes. Worker failures are tolerated (logged and
    dropped from the result list).

    Lifecycle: construct once per agent that uses it. The extractor agent is
    supplied at construction time and reused across all ``map_pages`` calls.

    Generic on the extractor output type ``T`` so callers can pull typed domain
    data (notes, claims, anything pydantic-validateable) out of each chunk.

    TODO(progress-events): the emitted events are currently named
    ``WholeDocRead*`` which is misleading once the mapper is used for things
    other than whole-document reading. Plan to introduce a more generic
    ``ChunkMap*`` event family in a follow-up PR and route consumers through a
    progress-event-factory parameter; for now every consumer gets the same
    ``WholeDocRead*`` events.
    """

    def __init__(
        self,
        runtime: AppRuntime,
        *,
        extractor: Agent[None, T],
        chars_per_slice: int | None = None,
        concurrency: int | None = None,
        worker_timeout_seconds: float | None = None,
        build_prompt: Callable[[str, str], str] | None = None,
        summary_counts: Callable[[T], tuple[int, int]] | None = None,
    ) -> None:
        chars = chars_per_slice if chars_per_slice is not None else runtime.settings.chunked_reasoner_chars_per_slice
        conc = concurrency if concurrency is not None else runtime.settings.chunked_reasoner_concurrency
        timeout = (
            worker_timeout_seconds
            if worker_timeout_seconds is not None
            else runtime.settings.chunked_reasoner_worker_timeout_seconds
        )
        if chars <= 0:
            raise ValueError("chars_per_slice must be positive")
        if conc <= 0:
            raise ValueError("concurrency must be positive")
        if timeout <= 0:
            raise ValueError("worker_timeout_seconds must be positive")
        self._extractor = extractor
        self._chars_per_slice = chars
        self._worker_timeout_seconds = timeout
        self._semaphore = asyncio.Semaphore(conc)
        self._build_prompt = build_prompt if build_prompt is not None else _default_build_prompt
        # Callback so consumers can fill in the per-slice progress event's
        # ``excerpts`` / ``facts`` counters from their extractor output
        # shape without the mapper duck-typing those fields off ``T``.
        # Defaults to ``(0, 0)`` so non-notes extractors don't crash the
        # progress emission.
        self._summary_counts = summary_counts if summary_counts is not None else _zero_counts

    @property
    def chars_per_slice(self) -> int:
        return self._chars_per_slice

    @property
    def worker_timeout_seconds(self) -> float:
        return self._worker_timeout_seconds

    @property
    def semaphore(self) -> asyncio.Semaphore:
        """The semaphore enforcing the mapper's concurrency cap.

        Exposed so secondary scheduling loops on the same mapper (e.g.
        :class:`ChunkedReasoner`'s compression rounds) can share the cap
        with the first-round map calls without reaching into private
        attributes.
        """
        return self._semaphore

    async def map_pages(self, pages: list[Page], query: str) -> list[ChunkOutput[T]]:
        """Slice ``pages``, run the extractor per slice in parallel, return outputs.

        Emits ``WholeDocReadStarted`` / ``WholeDocSliceDone`` (per completed
        chunk) / ``WholeDocReadDone`` over the request-scoped progress emitter.
        Worker failures are dropped (logged); their pages produce no
        ``ChunkOutput``. Cancellation propagates: pending extractor tasks are
        cancelled and drained so frontend disconnects stop spending tokens.

        Returns the per-chunk outputs sorted by first covered page.
        """
        if not pages:
            raise ValueError("ChunkedMapper.map_pages requires at least one page")

        chunks = [self._chunk_from_pages(slice_pages) for slice_pages in self.slice_pages(pages, self._chars_per_slice)]
        slice_total = len(chunks)
        logger.info(
            "[chunked-mapper] query=%r pages=%d slices=%d",
            query,
            len(pages),
            slice_total,
        )
        await emit_progress(WholeDocReadStarted(question=query, pages=len(pages), slices=slice_total))

        gather_start = time.perf_counter()
        outputs = await self._extract_chunks(chunks, query)

        await emit_progress(
            WholeDocReadDone(
                completed=len(outputs),
                slices=slice_total,
                duration_seconds=round(time.perf_counter() - gather_start, 2),
            )
        )
        return outputs

    async def _extract_chunks(self, chunks: list[_MapperChunk], query: str) -> list[ChunkOutput[T]]:
        """Run all chunks through the extractor in parallel; collect surviving outputs.

        Failures are logged and dropped. Emits a :class:`WholeDocSliceDone`
        per successful completion in completion order with a monotonic
        ``completed`` counter. Returned outputs are sorted by first page so
        callers get document-order results regardless of which task finished
        first.
        """
        total = len(chunks)
        pending: dict[asyncio.Task[_ChunkExtraction[T]], _MapperChunk] = {
            asyncio.create_task(self._extract_chunk(chunk, query)): chunk for chunk in chunks
        }

        outputs: list[ChunkOutput[T]] = []
        completed = 0
        slowest: tuple[str, float] | None = None

        try:
            while pending:
                done, _ = await asyncio.wait(pending.keys(), return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    chunk = pending.pop(task)
                    exc = task.exception()
                    if exc is not None:
                        logger.warning("[chunked-mapper] chunk %s failed: %s", chunk.label, exc)
                        continue
                    extraction = task.result()
                    outputs.append(ChunkOutput(pages=chunk.pages, output=extraction.output, label=chunk.label))
                    completed += 1
                    if slowest is None or extraction.duration_seconds > slowest[1]:
                        slowest = (chunk.label, extraction.duration_seconds)
                    excerpts, facts = self._summary_counts(extraction.output)
                    await emit_progress(
                        WholeDocSliceDone(
                            completed=completed,
                            total=total,
                            pages=chunk.label,
                            duration_ms=int(extraction.duration_seconds * 1000),
                            excerpts=excerpts,
                            facts=facts,
                        )
                    )
        finally:
            # On cancellation (typically a frontend disconnect propagating up
            # through the streaming orchestrator) the per-chunk model calls
            # would otherwise keep running to completion, billing tokens whose
            # results nobody is reading. Cancel and drain so the upstream
            # cancellation is the cancellation that matters.
            if pending:
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending.keys(), return_exceptions=True)

        if slowest is not None:
            logger.info(
                "[chunked-mapper] %d/%d chunks succeeded; slowest %s (%.1fs)",
                completed,
                total,
                slowest[0],
                slowest[1],
            )
        else:
            logger.info("[chunked-mapper] 0/%d chunks succeeded", total)

        outputs.sort(key=lambda o: o.pages[0] if o.pages else 0)
        return outputs

    async def _extract_chunk(self, chunk: _MapperChunk, query: str) -> _ChunkExtraction[T]:
        """Run the extractor on one chunk under the semaphore + timeout."""
        prompt = self._build_prompt(chunk.content, query)
        async with self._semaphore:
            start = time.perf_counter()
            try:
                result = await asyncio.wait_for(self._extractor.run(prompt), timeout=self._worker_timeout_seconds)
            except TimeoutError:
                duration = time.perf_counter() - start
                logger.warning(
                    "[chunked-mapper] chunk %s timed out after %dms (limit %.1fs)",
                    chunk.label,
                    int(duration * 1000),
                    self._worker_timeout_seconds,
                )
                raise
            duration = time.perf_counter() - start
        logger.debug("[chunked-mapper] chunk %s extracted in %dms", chunk.label, int(duration * 1000))
        return _ChunkExtraction(output=result.output, duration_seconds=duration)

    def _chunk_from_pages(self, pages: list[Page]) -> _MapperChunk:
        """Build a chunk from a slice of raw pages."""
        return _MapperChunk(
            content=self.format_chunk_content(pages),
            pages=[p.page_number for p in pages],
            label=_page_range_label(pages),
        )

    @staticmethod
    def slice_pages(pages: list[Page], chars_per_slice: int) -> list[list[Page]]:
        """Group consecutive pages into character-budgeted slices.

        Page boundaries are preserved: a single page is never split across
        slices. If one page exceeds the budget on its own, it becomes its own
        slice (and exceeds the budget — that's accepted rather than breaking
        page boundaries).
        """
        if chars_per_slice <= 0:
            raise ValueError("chars_per_slice must be positive")
        slices: list[list[Page]] = []
        current: list[Page] = []
        current_chars = 0
        for page in pages:
            if current and current_chars + page.char_count > chars_per_slice:
                slices.append(current)
                current = []
                current_chars = 0
            current.append(page)
            current_chars += page.char_count
        if current:
            slices.append(current)
        return slices

    @staticmethod
    def format_chunk_content(pages: list[Page]) -> str:
        """Render pages as ``[Page N]\\n<text>`` joined by blank lines.

        The standard format used by chunk content fed to extractors so every
        per-page reference is anchored by an explicit page marker. The
        per-page marker shape is owned by :data:`PAGE_MARKER_TEMPLATE` so
        downstream prompts can reference it without hardcoding the format.
        """
        return "\n\n".join(f"{PAGE_MARKER_TEMPLATE.format(n=p.page_number)}\n{p.text}" for p in pages)


def _zero_counts(_output: BaseModel) -> tuple[int, int]:
    """Default ``summary_counts`` callback.

    The progress event family is still notes-shaped (see class-level TODO
    in :class:`ChunkedMapper`); extractors whose output is not notes
    simply report ``(0, 0)`` so the event still emits.
    """
    return (0, 0)
