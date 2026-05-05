"""Chunked reasoning over long documents.

A reusable primitive for any agent that needs to answer a question that
requires reading a whole document end-to-end. The document is sliced into
contiguous page groups, each slice is read by a parallel worker that extracts
question-relevant notes, and the notes can either be returned as-is (for tool
use) or fed into a synthesis call (for self-contained map-then-reduce).

Used wherever pure RAG retrieval is the wrong tool: aggregations ("largest
number"), comparisons ("shortest chapter"), and full summaries.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts.documents import Page
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class ChunkNotes(ApiModel):
    """Notes extracted by a single worker from one slice of pages.

    The shape is deliberately question-agnostic: the worker is told what the
    user asked and decides what to put in ``relevant_excerpts`` and ``facts``.
    This lets one primitive serve summary, aggregation and comparison
    questions without per-question schema work.
    """

    pages: list[int] = Field(description="Page numbers covered by this slice (1-indexed).")
    summary: str = Field(description="One- to three-sentence summary of the slice's content.")
    relevant_excerpts: list[str] = Field(
        default_factory=list,
        description="Short verbatim quotes from the slice that bear on the user's question.",
    )
    facts: list[str] = Field(
        default_factory=list,
        description=(
            "Concrete facts (numbers, names, dates, claims) the synthesiser may need. "
            "Include any candidate value for aggregation questions, e.g. the largest "
            "number on this slice when the question asks for the largest overall."
        ),
    )


@dataclass(frozen=True)
class _Slice:
    pages: list[Page]


_WORKER_SYSTEM_PROMPT = (
    "You are reading one slice of pages from a longer document. The user has "
    "asked a question, and your job is to extract everything from this slice "
    "that could help answer it. The final answer is assembled from many such "
    "extractions across the document, so be thorough: if you skip a relevant "
    "fact here, no later step can recover it.\n"
    "\n"
    "Stay grounded in the supplied text. Do not infer or fabricate "
    "information that isn't present. If nothing in this slice is relevant, "
    "return empty excerpts and facts and a short neutral summary.\n"
    "\n"
    "For aggregation questions (largest, smallest, count, total), include "
    "the candidate value for THIS slice in 'facts' even if you don't know "
    "whether it's the global answer. The synthesiser will compare across "
    "slices."
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
        Construct once per agent that uses it. The worker agent is built at
        construction time and reused; the synthesis agent in :meth:`reason`
        is built per call because its output type is generic.
    """

    def __init__(
        self,
        runtime: AppRuntime,
        *,
        chars_per_slice: int | None = None,
        concurrency: int | None = None,
    ) -> None:
        chars = chars_per_slice if chars_per_slice is not None else runtime.settings.chunked_reasoner_chars_per_slice
        conc = concurrency if concurrency is not None else runtime.settings.chunked_reasoner_concurrency
        if chars <= 0:
            raise ValueError("chars_per_slice must be positive")
        if conc <= 0:
            raise ValueError("concurrency must be positive")
        self._runtime = runtime
        self._chars_per_slice = chars
        self._semaphore = asyncio.Semaphore(conc)
        self._worker: Agent[None, ChunkNotes] = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(ChunkNotes),
            system_prompt=_WORKER_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def gather_notes(self, pages: list[Page], question: str) -> list[ChunkNotes]:
        """Run the map phase: slice pages, fan out workers, collect notes.

        Worker failures are tolerated: surviving workers' notes are returned.
        Returns an empty list only when every worker raises, which the caller
        can treat as a hard failure.
        """
        if not pages:
            raise ValueError("ChunkedReasoner.gather_notes requires at least one page")

        slices = self._slice_pages(pages)
        logger.info(
            "[chunked-reasoner] question=%r pages=%d slices=%d",
            question,
            len(pages),
            len(slices),
        )

        results = await asyncio.gather(
            *(self._run_worker(s, question) for s in slices),
            return_exceptions=True,
        )

        notes: list[ChunkNotes] = []
        for slice_, result in zip(slices, results):
            if isinstance(result, BaseException):
                logger.warning(
                    "[chunked-reasoner] worker failed on pages %s: %s",
                    [p.page_number for p in slice_.pages],
                    result,
                )
                continue
            notes.append(result)
        return notes

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

    async def _run_worker(self, slice_: _Slice, question: str) -> ChunkNotes:
        prompt = self._build_worker_prompt(slice_, question)
        async with self._semaphore:
            result = await self._worker.run(prompt)
        return result.output

    @staticmethod
    def _build_worker_prompt(slice_: _Slice, question: str) -> str:
        page_numbers = [p.page_number for p in slice_.pages]
        header = f"User question:\n{question}\n\nSlice covers pages {page_numbers[0]} to {page_numbers[-1]}.\n"
        body_parts = [f"[Page {p.page_number}]\n{p.text}" for p in slice_.pages]
        return header + "\n" + "\n\n".join(body_parts)

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
