"""Chunked reasoning over long documents.

A reusable primitive for any agent that needs to answer a question that
requires reading a whole document end-to-end. The document is split into
character-budgeted chunks; each chunk is read by a parallel worker that
extracts question-relevant notes; if the gathered notes overflow the
synthesis context budget, the resulting notes are regrouped into fresh
chunks and run through the same extractor again, until they fit.

Pages are tracked by the wrapper, never asked of the model: keeps the model
output schema small and the page list authoritative.

Used wherever pure RAG retrieval is the wrong tool: aggregations ("largest
number"), comparisons ("shortest chapter"), and full summaries.

Implementation note: the first-round per-chunk extraction (slice, schedule,
timeout, cancel-drain) is delegated to :class:`ChunkedMapper`. The
compression loop and the synthesis stage are reasoning-specific and live
here: compression-round chunks carry a ``fallback`` so a failed group
preserves its input notes instead of dropping page coverage, which is a
different shape from the generic mapper.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.shared.chunked_mapper import ChunkedMapper, _ChunkExtraction
from stirling.contracts import WholeDocCompressionRound
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
class _CompressionChunk:
    """A compression-round unit of work: formatted notes + their pages + a fallback.

    Built from a group of prior-pass :class:`ChunkNotes`. ``fallback`` is the
    input group itself: if the extractor call fails the originals stay in the
    working set so page coverage isn't lost. This is the part of the
    scheduling shape the generic :class:`ChunkedMapper` deliberately does NOT
    cover — it's reasoning-specific.
    """

    content: str
    pages: list[int]
    fallback: list[ChunkNotes]
    label: str


@dataclass(frozen=True)
class _RoundResult:
    """Outcome of one extraction round.

    ``successes`` lets the loop detect rounds that made no forward progress
    (every chunk failed) and bail rather than spinning.
    """

    notes: list[ChunkNotes]
    successes: int


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
    """Run a question against a long document by chunking, mapping, and looping.

    Two consumption styles:

    * Tools that already have a synthesising LLM call upstream call
      :meth:`gather_notes` to get the structured notes and format them
      themselves with :meth:`format_notes`.
    * Callers that just want an answer call :meth:`reason`, which runs
      :meth:`gather_notes` and then a single synthesis call governed by the
      caller's ``answer_prompt`` and ``answer_type``.

    Lifetime:
        Construct once per agent that uses it. The extractor agent is built
        at construction time (and reused via an internal :class:`ChunkedMapper`);
        the synthesis agent in :meth:`reason` is built per call because its
        output type is generic.
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
        budget = (
            notes_char_budget if notes_char_budget is not None else runtime.settings.chunked_reasoner_notes_char_budget
        )
        if budget <= 0:
            raise ValueError("notes_char_budget must be positive")
        self._runtime = runtime
        self._notes_char_budget = budget
        self._extractor: Agent[None, _ExtractedNotes] = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(_ExtractedNotes),
            system_prompt=_EXTRACTOR_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        # The generic mapper owns slicing, concurrency, timeout and
        # cancellation drain. Compression rounds reuse the same extractor +
        # scheduling shape via an internal scheduler below.
        self._mapper: ChunkedMapper[_ExtractedNotes] = ChunkedMapper(
            runtime,
            extractor=self._extractor,
            chars_per_slice=chars_per_slice,
            concurrency=concurrency,
            worker_timeout_seconds=worker_timeout_seconds,
            build_prompt=self._build_extraction_prompt,
            # Fill in the WholeDocSliceDone event's excerpt/fact counters
            # from our notes shape — the mapper itself is generic on the
            # extractor output and stays ignorant of this schema.
            summary_counts=lambda notes: (len(notes.relevant_excerpts), len(notes.facts)),
        )
        # Shadow scheduling knobs for the compression-round scheduler.
        self._semaphore = self._mapper.semaphore
        self._chars_per_slice = self._mapper.chars_per_slice
        self._worker_timeout_seconds = self._mapper.worker_timeout_seconds

    async def gather_notes(self, pages: list[Page], question: str) -> list[ChunkNotes]:
        """Return notes covering every page that fit the synthesis budget.

        Worker failures are tolerated: surviving notes are returned. Returns
        an empty list only when every first-round chunk raises, which the
        caller can treat as a hard failure.

        Progress events fire as each first-round chunk finishes (in completion
        order, not chunk order) carrying a monotonic ``completed`` counter so
        consumers can render "Read X of Y" with X advancing by exactly one
        per event. Subsequent compression rounds emit a single round-start
        event each.
        """
        if not pages:
            raise ValueError("ChunkedReasoner.gather_notes requires at least one page")

        # First round: delegate to the generic mapper. Each ChunkOutput
        # carries the chunk's _ExtractedNotes plus the pages the mapper
        # assigned it.
        outputs = await self._mapper.map_pages(pages, question)
        first_round_notes = [self._build_chunk_notes(o.output, o.pages) for o in outputs]
        first_round_notes.sort(key=lambda n: n.pages[0] if n.pages else 0)

        return await self._compress_until_fits(first_round_notes, question)

    async def _compress_until_fits(self, notes: list[ChunkNotes], question: str) -> list[ChunkNotes]:
        """Regroup and re-extract until the rendered notes fit ``notes_char_budget``.

        First-round notes come in; compression-round chunks carry a
        ``fallback`` so failures preserve page coverage. Each round may produce
        fewer notes than chunks (every chunk maps to at most one consolidated
        note); when the rendered notes still exceed the budget, the survivors
        are regrouped into fresh chunks and the loop runs again.
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
            chunks = [self._chunk_from_notes(group) for group in groups]
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

            result = await self._run_compression_round(chunks, question)
            logger.info(
                "[chunked-reasoner] round %d: %d/%d chunks succeeded",
                round_number,
                result.successes,
                len(chunks),
            )
            if result.successes == 0:
                # No forward progress this round; further rounds would
                # reproduce the same shape. Return what we have (including the
                # fallback-preserved input notes for each failed chunk).
                logger.warning(
                    "[chunked-reasoner] round %d produced no successful extractions; bailing with %d notes",
                    round_number,
                    len(result.notes),
                )
                return result.notes
            notes = result.notes

    async def _run_compression_round(self, chunks: list[_CompressionChunk], question: str) -> _RoundResult:
        """Run a compression round through the extractor in parallel.

        Failures fall back to ``chunk.fallback`` so the originals stay in the
        working set; that's the bit the generic mapper can't do. Reuses the
        mapper's semaphore + timeout + cancel-drain shape. ``question`` is
        threaded through so compression rounds consolidate notes against the
        same relevance criteria as the first round — see Aikido finding on
        PR #6369.
        """
        pending: dict[asyncio.Task[_ChunkExtraction[ChunkNotes]], _CompressionChunk] = {
            asyncio.create_task(self._extract_compression_chunk(chunk, question)): chunk for chunk in chunks
        }
        notes: list[ChunkNotes] = []
        successes = 0
        try:
            while pending:
                done, _ = await asyncio.wait(pending.keys(), return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    chunk = pending.pop(task)
                    exc = task.exception()
                    if exc is not None:
                        logger.warning(
                            "[chunked-reasoner] chunk %s failed: %s; preserving %d input note(s)",
                            chunk.label,
                            exc,
                            len(chunk.fallback),
                        )
                        notes.extend(chunk.fallback)
                        continue
                    # ``duration_seconds`` is recorded on the extraction but
                    # compression rounds don't surface per-chunk timings the
                    # way the first round does, so we only read ``.output``.
                    notes.append(task.result().output)
                    successes += 1
        finally:
            if pending:
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending.keys(), return_exceptions=True)

        notes.sort(key=lambda n: n.pages[0] if n.pages else 0)
        return _RoundResult(notes=notes, successes=successes)

    async def _extract_compression_chunk(self, chunk: _CompressionChunk, question: str) -> _ChunkExtraction[ChunkNotes]:
        """Run the extractor on a compression-round chunk; attach pages deterministically.

        ``question`` carries the same user query the first-round extractors
        saw, so consolidation uses identical relevance criteria across rounds.
        """
        prompt = self._build_extraction_prompt(chunk.content, question)
        async with self._semaphore:
            start = time.perf_counter()
            try:
                result = await asyncio.wait_for(self._extractor.run(prompt), timeout=self._worker_timeout_seconds)
            except TimeoutError:
                logger.warning(
                    "[chunked-reasoner] compression chunk %s timed out (limit %.1fs)",
                    chunk.label,
                    self._worker_timeout_seconds,
                )
                raise
            duration = time.perf_counter() - start
        return _ChunkExtraction(
            output=self._build_chunk_notes(result.output, chunk.pages),
            duration_seconds=duration,
        )

    def _chunk_from_notes(self, group: list[ChunkNotes]) -> _CompressionChunk:
        """Build a compression-round chunk from a group of prior-pass notes.

        ``fallback`` is the input group itself: if the extractor call fails,
        the originals stay in the working set so page coverage isn't lost.
        """
        return _CompressionChunk(
            content=self.format_notes(group),
            pages=sorted({p for note in group for p in note.pages}),
            fallback=group,
            label=_note_range_label(group),
        )

    def _slice_pages(self, pages: list[Page]) -> list[list[Page]]:
        """Group consecutive pages into character-budgeted slices.

        Thin pass-through to :meth:`ChunkedMapper.slice_pages` so existing
        tests that drive slicing through the reasoner instance keep working.
        """
        return ChunkedMapper.slice_pages(pages, self._chars_per_slice)

    def _group_notes_for_compression(self, notes: list[ChunkNotes]) -> list[list[ChunkNotes]]:
        """Pack consecutive notes into groups whose rendered size fits ``chars_per_slice``.

        Each group becomes one compression-round chunk. Sized to match the
        first-round slice budget so the extractor sees roughly the same input
        footprint regardless of which round is running. Single notes that
        exceed the budget on their own become their own group.
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
        """Single prompt shape used for every round.

        The system prompt explains the role; the user prompt just hands over
        the question and the content. Whether ``content`` is raw page text
        with ``[Page N]`` markers or formatted notes with ``[Notes from
        pages A-B]`` markers, the same instructions apply.
        """
        return f"User question:\n{question}\n\nContent:\n{content}"

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
