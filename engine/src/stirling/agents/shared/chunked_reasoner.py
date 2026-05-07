"""Chunked reasoning over long documents.

A reusable primitive for any agent that needs to answer a question that
requires reading a whole document end-to-end. The document is sliced into
contiguous page groups, each slice is read by a parallel worker that extracts
question-relevant notes, and the notes can either be returned as-is (for tool
use) or fed into a synthesis call (for self-contained map-then-reduce).

When the gathered notes would exceed the synthesis context budget, the same
extractor is applied recursively to grouped notes until they fit. Pages are
tracked by the wrapper, never asked of the model: keeps the model output
schema small and the page list authoritative.

Used wherever pure RAG retrieval is the wrong tool: aggregations ("largest
number"), comparisons ("shortest chapter"), and full summaries.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    WholeDocCompressionRound,
    WholeDocReadDone,
    WholeDocReadStarted,
    WholeDocSliceDone,
)
from stirling.contracts.documents import Page
from stirling.models import ApiModel
from stirling.services import AppRuntime, emit_progress

logger = logging.getLogger(__name__)


class ChunkNotes(ApiModel):
    """Public-facing notes for a span of pages.

    Returned to callers of :meth:`ChunkedReasoner.gather_notes` and to the
    inside of :meth:`ChunkedReasoner.reason`. The wrapper builds these from
    the model's :class:`_ExtractedNotes` output and a deterministic page list.
    """

    pages: list[int] = Field(description="Page numbers covered by these notes (1-indexed).")
    summary: str = Field(description="One- to three-sentence summary of the covered range.")
    relevant_excerpts: list[str] = Field(
        default_factory=list,
        description="Short verbatim quotes from the source content that bear on the user's question.",
    )
    facts: list[str] = Field(
        default_factory=list,
        description=(
            "Concrete facts (numbers, names, dates, claims) the synthesiser may need. "
            "Includes candidate values for aggregation questions."
        ),
    )


class _ExtractedNotes(BaseModel):
    """Model output for one extractor call.

    No ``pages`` field: page numbers are mechanical aggregation the wrapper
    computes deterministically. Keeping them out of the schema saves output
    tokens for the bulkier excerpts/facts payload and prevents the model
    from misreporting page coverage.
    """

    summary: str = Field(description="One- to three-sentence summary of the supplied content.")
    relevant_excerpts: list[str] = Field(
        default_factory=list,
        description=(
            "Short verbatim quotes drawn from the supplied content that bear on the question. "
            "Deduplicate; drop ones that don't bear on the question."
        ),
    )
    facts: list[str] = Field(
        default_factory=list,
        description=(
            "Distinct, deduplicated facts (numbers, names, dates, claims) needed to answer "
            "the question. For aggregation questions retain ALL candidate values across the "
            "supplied content so a later round can still pick the global winner."
        ),
    )


@dataclass(frozen=True)
class _Slice:
    """A contiguous group of pages destined for one round-1 extractor call."""

    pages: list[Page]


def _page_range_label(pages: list[Page]) -> str:
    if not pages:
        return "pages=?"
    elif len(pages) == 1:
        return f"pages={pages[0].page_number}"
    else:
        return f"pages={pages[0].page_number}-{pages[-1].page_number}"


def _note_range_label(notes: list[ChunkNotes]) -> str:
    """Render a "pages=A-B" label for a group of already-extracted notes."""
    page_numbers = sorted({p for note in notes for p in note.pages})
    if not page_numbers:
        return "pages=?"
    if len(page_numbers) == 1:
        return f"pages={page_numbers[0]}"
    return f"pages={page_numbers[0]}-{page_numbers[-1]}"


_EXTRACTOR_SYSTEM_PROMPT = (
    "You are reading content from a document - either raw page text or "
    "condensed notes from an earlier extraction pass - and your job is to "
    "produce a tight set of notes that captures everything relevant to the "
    "user's question. The same job runs many times in parallel across the "
    "document and may run again to consolidate notes into smaller batches, "
    "so be thorough: anything you skip cannot be recovered later.\n"
    "\n"
    "Output:\n"
    "- summary: 1-3 sentences covering the supplied content.\n"
    "- relevant_excerpts: short verbatim quotes from the supplied content "
    "that bear on the question. Deduplicate; drop quotes that don't help.\n"
    "- facts: concrete facts (numbers, names, dates, claims). Deduplicate; "
    "drop irrelevant ones. For aggregation questions (largest, smallest, "
    "count, total) retain ALL candidate values across the content so a "
    "later step can still pick the global winner.\n"
    "\n"
    "Stay grounded in the supplied content. Do not infer or fabricate "
    "anything that isn't already present. If nothing in the content is "
    "relevant to the question, return empty excerpts and facts and a short "
    "neutral summary."
)


class ChunkedReasoner:
    """Run a question against a long document by slicing and mapping in parallel.

    Two consumption styles:

    * Tools that already have a synthesising LLM call upstream call
      :meth:`gather_notes` to get the structured notes and format them
      themselves with :meth:`format_notes`.
    * Callers that just want an answer call :meth:`reason`, which runs
      :meth:`gather_notes` and then a single synthesis call governed by the
      caller's ``answer_prompt`` and ``answer_type``.

    Lifetime:
        Construct once per agent that uses it. The extractor agent is built
        at construction time and reused; the synthesis agent in :meth:`reason`
        is built per call because its output type is generic.
    """

    def __init__(
        self,
        runtime: AppRuntime,
        *,
        chars_per_slice: int | None = None,
        concurrency: int | None = None,
        worker_timeout_seconds: float | None = None,
        notes_char_budget: int | None = None,
    ) -> None:
        chars = chars_per_slice if chars_per_slice is not None else runtime.settings.chunked_reasoner_chars_per_slice
        conc = concurrency if concurrency is not None else runtime.settings.chunked_reasoner_concurrency
        timeout = (
            worker_timeout_seconds
            if worker_timeout_seconds is not None
            else runtime.settings.chunked_reasoner_worker_timeout_seconds
        )
        budget = (
            notes_char_budget if notes_char_budget is not None else runtime.settings.chunked_reasoner_notes_char_budget
        )
        if chars <= 0:
            raise ValueError("chars_per_slice must be positive")
        if conc <= 0:
            raise ValueError("concurrency must be positive")
        if timeout <= 0:
            raise ValueError("worker_timeout_seconds must be positive")
        if budget <= 0:
            raise ValueError("notes_char_budget must be positive")
        self._runtime = runtime
        self._chars_per_slice = chars
        self._worker_timeout_seconds = timeout
        self._notes_char_budget = budget
        self._semaphore = asyncio.Semaphore(conc)
        self._extractor: Agent[None, _ExtractedNotes] = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(_ExtractedNotes),
            system_prompt=_EXTRACTOR_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def gather_notes(self, pages: list[Page], question: str) -> list[ChunkNotes]:
        """Run the map phase: slice pages, fan out workers, collect notes.

        Worker failures are tolerated: surviving workers' notes are returned.
        Returns an empty list only when every worker raises, which the caller
        can treat as a hard failure.

        Progress events fire as each worker finishes (in completion order, not
        slice order) carrying a monotonic ``completed`` counter so consumers
        can render "Read X of Y" with X advancing by exactly one per event.

        After the map phase, if the rendered notes would exceed
        ``notes_char_budget``, the same extractor is applied recursively to
        groups of notes until they fit. Failed compression groups keep their
        input notes in the working set so page coverage isn't silently lost.
        """
        if not pages:
            raise ValueError("ChunkedReasoner.gather_notes requires at least one page")

        slices = self._slice_pages(pages)
        total = len(slices)
        logger.info(
            "[chunked-reasoner] question=%r pages=%d slices=%d",
            question,
            len(pages),
            total,
        )
        await emit_progress(WholeDocReadStarted(question=question, pages=len(pages), slices=total))

        gather_start = time.perf_counter()
        notes, slowest = await self._run_round_1(slices, total, question)
        gather_elapsed = time.perf_counter() - gather_start

        if slowest is not None:
            slow_slice, slow_duration = slowest
            logger.info(
                "[chunked-reasoner] gathered %d/%d slices in %.1fs; slowest %s (%.1fs)",
                len(notes),
                total,
                gather_elapsed,
                _page_range_label(slow_slice.pages),
                slow_duration,
            )
        else:
            logger.info(
                "[chunked-reasoner] gathered 0/%d slices in %.1fs (all workers failed)",
                total,
                gather_elapsed,
            )

        notes = await self._compress_notes(notes, question)

        await emit_progress(
            WholeDocReadDone(
                completed=len(notes),
                slices=total,
                duration_seconds=round(time.perf_counter() - gather_start, 2),
            )
        )
        return notes

    async def _run_round_1(
        self,
        slices: list[_Slice],
        total: int,
        question: str,
    ) -> tuple[list[ChunkNotes], tuple[_Slice, float] | None]:
        """Spawn one extractor task per slice and process completions as they arrive.

        Returns the surviving notes (in completion order) and the slowest
        successful slice for the gather summary log line. Each successful
        completion emits a :class:`WholeDocSliceDone` event with ``completed``
        bumped by one, regardless of which slice happens to finish.
        """
        pending: dict[asyncio.Task[tuple[ChunkNotes, float]], _Slice] = {
            asyncio.create_task(self._extract_slice(i + 1, total, slice_, question)): slice_
            for i, slice_ in enumerate(slices)
        }

        notes: list[ChunkNotes] = []
        slowest: tuple[_Slice, float] | None = None
        completed = 0

        while pending:
            done, _ = await asyncio.wait(pending.keys(), return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                slice_ = pending.pop(task)
                exc = task.exception()
                if exc is not None:
                    logger.warning(
                        "[chunked-reasoner] slice %s failed: %s",
                        _page_range_label(slice_.pages),
                        exc,
                    )
                    continue
                chunk_notes, duration = task.result()
                notes.append(chunk_notes)
                completed += 1
                if slowest is None or duration > slowest[1]:
                    slowest = (slice_, duration)
                await emit_progress(
                    WholeDocSliceDone(
                        completed=completed,
                        total=total,
                        pages=_page_range_label(slice_.pages),
                        duration_ms=int(duration * 1000),
                        excerpts=len(chunk_notes.relevant_excerpts),
                        facts=len(chunk_notes.facts),
                    )
                )
        return notes, slowest

    async def _compress_notes(self, notes: list[ChunkNotes], question: str) -> list[ChunkNotes]:
        """Recursively re-run the extractor on grouped notes until they fit the budget.

        Each round groups notes into batches sized to ``chars_per_slice`` and
        runs one extractor call per batch in parallel; each call produces one
        consolidated note. Failed groups keep their input notes in the
        survivor set so we never silently lose page coverage. The loop bails
        if a round can't actually shrink the working set (e.g. every group
        failed) so we don't spin forever.
        """
        round_number = 0
        while True:
            rendered_size = self._rendered_notes_size(notes)
            if rendered_size <= self._notes_char_budget or len(notes) <= 1:
                if round_number > 0:
                    logger.info(
                        "[chunked-reasoner] compression done after %d round(s): %d notes, %d chars",
                        round_number,
                        len(notes),
                        rendered_size,
                    )
                return notes

            round_number += 1
            groups = self._group_notes_for_compression(notes)
            logger.info(
                "[chunked-reasoner] compression round %d: %d notes (%d chars) -> %d groups",
                round_number,
                len(notes),
                rendered_size,
                len(groups),
            )
            await emit_progress(
                WholeDocCompressionRound(
                    round_number=round_number,
                    notes_in=len(notes),
                    groups=len(groups),
                )
            )

            results = await asyncio.gather(
                *(self._extract_compression_group(group, question) for group in groups),
                return_exceptions=True,
            )

            survivors: list[ChunkNotes] = []
            successes = 0
            for group, result in zip(groups, results):
                if isinstance(result, BaseException):
                    logger.warning(
                        "[chunked-reasoner] compression group %s failed: %s; preserving %d input note(s)",
                        _note_range_label(group),
                        result,
                        len(group),
                    )
                    # Keep the input notes so page coverage isn't lost. The
                    # next round may regroup them differently and succeed.
                    survivors.extend(group)
                    continue
                survivors.append(result)
                successes += 1

            if successes == 0:
                # No group made forward progress this round; further rounds
                # would just retry the same shape. Return what we have so the
                # synthesis stage can attempt an answer (or fail loudly).
                logger.warning(
                    "[chunked-reasoner] compression round %d produced no successful folds; bailing with %d notes",
                    round_number,
                    len(survivors),
                )
                return survivors

            notes = survivors

    def _group_notes_for_compression(self, notes: list[ChunkNotes]) -> list[list[ChunkNotes]]:
        """Pack consecutive notes into groups whose rendered size fits ``chars_per_slice``.

        Each group becomes one extractor-call input. Sized to match the
        round-1 slice budget so the extractor sees roughly the same input
        footprint regardless of whether it's reading raw pages or notes.
        Single notes that exceed the budget on their own become their own group.
        """
        groups: list[list[ChunkNotes]] = []
        current: list[ChunkNotes] = []
        current_chars = 0
        for note in notes:
            note_chars = self._rendered_notes_size([note])
            if current and current_chars + note_chars > self._chars_per_slice:
                groups.append(current)
                current = []
                current_chars = 0
            current.append(note)
            current_chars += note_chars
        if current:
            groups.append(current)
        return groups

    async def _extract_slice(
        self,
        index: int,
        total: int,
        slice_: _Slice,
        question: str,
    ) -> tuple[ChunkNotes, float]:
        """Round-1 wrapper: format pages as content, run extractor, attach slice's pages."""
        content = self._format_slice_content(slice_)
        page_label = _page_range_label(slice_.pages)
        page_numbers = [p.page_number for p in slice_.pages]
        try:
            extracted, duration = await self._run_extractor(content, question, page_label)
        except TimeoutError:
            logger.warning(
                "[chunked-reasoner] slice %d/%d %s timed out (limit %.1fs)",
                index,
                total,
                page_label,
                self._worker_timeout_seconds,
            )
            raise
        logger.debug(
            "[chunked-reasoner] slice %d/%d %s: %d excerpt(s), %d fact(s) in %dms",
            index,
            total,
            page_label,
            len(extracted.relevant_excerpts),
            len(extracted.facts),
            int(duration * 1000),
        )
        return self._build_chunk_notes(extracted, page_numbers), duration

    async def _extract_compression_group(
        self,
        group: list[ChunkNotes],
        question: str,
    ) -> ChunkNotes:
        """Round-N wrapper: format the group's notes as content, run extractor, attach union pages."""
        content = self.format_notes(group)
        page_label = _note_range_label(group)
        page_numbers = sorted({p for note in group for p in note.pages})
        try:
            extracted, duration = await self._run_extractor(content, question, page_label)
        except TimeoutError:
            logger.warning(
                "[chunked-reasoner] compression %s timed out (limit %.1fs)",
                page_label,
                self._worker_timeout_seconds,
            )
            raise
        logger.debug(
            "[chunked-reasoner] compressed %s (%d notes -> 1) in %dms: %d excerpt(s), %d fact(s)",
            page_label,
            len(group),
            int(duration * 1000),
            len(extracted.relevant_excerpts),
            len(extracted.facts),
        )
        return self._build_chunk_notes(extracted, page_numbers)

    async def _run_extractor(
        self,
        content: str,
        question: str,
        page_label: str,
    ) -> tuple[_ExtractedNotes, float]:
        """Inner primitive: run the single extractor agent under semaphore + timeout.

        Used by both round-1 (raw pages) and round-N (note groups) callers.
        Returns the model's structured output plus wall-clock duration so
        callers can log + emit slowest-task stats.
        """
        prompt = self._build_extraction_prompt(content, question)
        async with self._semaphore:
            start = time.perf_counter()
            try:
                result = await asyncio.wait_for(self._extractor.run(prompt), timeout=self._worker_timeout_seconds)
            except TimeoutError:
                duration = time.perf_counter() - start
                logger.debug(
                    "[chunked-reasoner] extractor %s timed out after %dms",
                    page_label,
                    int(duration * 1000),
                )
                raise
            duration = time.perf_counter() - start
        return result.output, duration

    @staticmethod
    def _build_chunk_notes(extracted: _ExtractedNotes, pages: list[int]) -> ChunkNotes:
        """Build a public ChunkNotes from the model's output and the wrapper's pages."""
        return ChunkNotes(
            pages=pages,
            summary=extracted.summary,
            relevant_excerpts=extracted.relevant_excerpts,
            facts=extracted.facts,
        )

    @staticmethod
    def _build_extraction_prompt(content: str, question: str) -> str:
        """Single prompt shape used for both rounds.

        The system prompt explains the role; the user prompt just hands over
        the question and the content. Whether ``content`` is raw page text
        with ``[Page N]`` markers or formatted notes with ``[Notes from
        pages A-B]`` markers, the same instructions apply.
        """
        return f"User question:\n{question}\n\nContent:\n{content}"

    @staticmethod
    def _format_slice_content(slice_: _Slice) -> str:
        """Render a slice of raw pages as the extractor's input content."""
        return "\n\n".join(f"[Page {p.page_number}]\n{p.text}" for p in slice_.pages)

    @staticmethod
    def _rendered_notes_size(notes: list[ChunkNotes]) -> int:
        """Length in characters of what :meth:`format_notes` would produce."""
        return len(ChunkedReasoner.format_notes(notes))

    async def reason[T: BaseModel](
        self,
        *,
        pages: list[Page],
        question: str,
        answer_prompt: str,
        answer_type: type[T],
    ) -> T:
        """Map over pages, then synthesise a structured answer of type ``T``.

        Args:
            pages: Document pages in order.
            question: The user's question, passed to both workers and the
                synthesiser. Workers use it to decide what's relevant.
            answer_prompt: System prompt for the synthesis stage. Should
                instruct the model to answer ``question`` from the notes
                supplied. Owned by the caller because the answer's tone,
                format, and grounding rules are domain-specific.
            answer_type: Pydantic model describing the structured answer.

        Returns:
            An instance of ``answer_type`` produced by the synthesis stage.
        """
        notes = await self.gather_notes(pages, question)
        if not notes:
            raise RuntimeError("All chunked-reasoning workers failed; no notes to synthesise from")
        return await self._synthesise(question, notes, answer_prompt, answer_type)

    @staticmethod
    def format_notes(notes: list[ChunkNotes]) -> str:
        """Render notes as readable text for inclusion in another agent's tool result.

        Order is preserved. Page numbers, summary, excerpts and facts are all
        emitted; empty sections are omitted.
        """
        sections: list[str] = []
        for n in notes:
            page_label = (
                f"pages {n.pages[0]}-{n.pages[-1]}"
                if len(n.pages) > 1
                else f"page {n.pages[0]}"
                if n.pages
                else "unknown pages"
            )
            block = [f"[Notes from {page_label}]", f"Summary: {n.summary}"]
            if n.relevant_excerpts:
                block.append("Relevant excerpts:")
                block.extend(f"- {e}" for e in n.relevant_excerpts)
            if n.facts:
                block.append("Facts:")
                block.extend(f"- {f}" for f in n.facts)
            sections.append("\n".join(block))
        return "\n\n".join(sections)

    def _slice_pages(self, pages: list[Page]) -> list[_Slice]:
        """Group consecutive pages into character-budgeted slices.

        Page boundaries are preserved: a single page is never split across
        slices. If one page exceeds the budget on its own, it becomes its
        own slice.
        """
        slices: list[_Slice] = []
        current: list[Page] = []
        current_chars = 0
        for page in pages:
            if current and current_chars + page.char_count > self._chars_per_slice:
                slices.append(_Slice(pages=current))
                current = []
                current_chars = 0
            current.append(page)
            current_chars += page.char_count
        if current:
            slices.append(_Slice(pages=current))
        return slices

    async def _synthesise[T: BaseModel](
        self,
        question: str,
        notes: list[ChunkNotes],
        answer_prompt: str,
        answer_type: type[T],
    ) -> T:
        agent: Agent[None, T] = Agent(
            model=self._runtime.smart_model,
            output_type=NativeOutput(answer_type),
            system_prompt=answer_prompt,
            model_settings=self._runtime.smart_model_settings,
        )
        prompt = f"User question:\n{question}\n\nNotes from across the document:\n\n{self.format_notes(notes)}"
        result = await agent.run(prompt)
        return result.output
