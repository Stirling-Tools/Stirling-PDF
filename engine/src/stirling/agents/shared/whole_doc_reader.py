"""Tool capability that lets an agent read whole documents end-to-end.

Companion to :class:`stirling.documents.RagCapability`. Where ``RagCapability``
gives an agent targeted vector retrieval, this gives it map-style whole-document
reading: every page is read in parallel by fast-model workers, and the
question-relevant notes are returned for the agent to synthesise.

Use both capabilities together when the agent should pick its strategy:
``search_knowledge`` for specific lookups, ``read_full_document`` for
aggregations, comparisons, and summaries.
"""

from __future__ import annotations

import logging

from pydantic_ai import FunctionToolset, RunContext, ToolDefinition
from pydantic_ai.toolsets import AbstractToolset

from stirling.agents.shared.chunked_reasoner import ChunkedReasoner
from stirling.contracts import AiFile
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


# Default cap on per-run calls. Each call fans out a worker per slice of every
# attached document, so it is genuinely expensive. The agent is told to reach
# for it sparingly via the tool description.
DEFAULT_MAX_READS = 2


class WholeDocReaderCapability:
    """Bundles instructions and the ``read_full_document`` toolset for agent injection.

    Lifecycle: a ``WholeDocReaderCapability`` instance is intended to live for
    the duration of a single agent run.

    The agent picks between this and :class:`RagCapability` per the tool
    descriptions: targeted retrieval vs whole-document reading.
    """

    def __init__(
        self,
        runtime: AppRuntime,
        files: list[AiFile],
        *,
        reasoner: ChunkedReasoner | None = None,
        max_reads: int = DEFAULT_MAX_READS,
    ) -> None:
        self._runtime = runtime
        self._files = files
        self._reasoner = reasoner if reasoner is not None else ChunkedReasoner(runtime)
        self._max_reads = max_reads
        self._read_count = 0
        toolset: FunctionToolset[None] = FunctionToolset()
        toolset.add_function(
            self._read_full_document,
            name="read_full_document",
            prepare=self._prepare_read_full_document,
        )
        self._toolset = toolset

    @property
    def instructions(self) -> str:
        names = ", ".join(f.name for f in self._files) if self._files else "the attached documents"
        return (
            "You have a 'read_full_document' tool that reads every page of "
            f"{names} in parallel and returns notes relevant to a query. "
            "Use it when answering requires seeing the whole document end-to-end "
            "(summaries, aggregations, comparisons across sections). It is more "
            "expensive than 'search_knowledge'; prefer search_knowledge for "
            "specific lookups when one or two passages would suffice."
        )

    @property
    def toolset(self) -> AbstractToolset[None]:
        return self._toolset

    async def _prepare_read_full_document(
        self,
        ctx: RunContext[None],
        tool_def: ToolDefinition,
    ) -> ToolDefinition | None:
        """Hide the tool from the agent's toolset once the per-run budget is spent.
        Mirrors the search_knowledge prepare callback."""
        if self._read_count >= self._max_reads:
            return None
        return tool_def

    async def _read_full_document(self, query: str) -> str:
        """Read every page of the attached documents and return notes relevant to the query.

        Use this when answering needs the whole document end-to-end - summaries,
        aggregations like 'largest number' or 'shortest chapter', or comparisons
        across sections. Slow and expensive (one fast-model call per slice per
        document); prefer search_knowledge for targeted lookups.

        Args:
            query: A focused description of what to extract from the documents,
                phrased so a worker reading just one slice can decide what's
                relevant to the user's question.

        Returns:
            Per-document sections of structured notes (page numbers, summary,
            relevant excerpts, extracted facts), already ordered by page.
        """
        self._read_count += 1
        if not self._files:
            return "No documents attached to read."

        sections: list[str] = []
        for file in self._files:
            pages = await self._runtime.documents.read_pages(file.id)
            if not pages:
                logger.info(
                    "[whole-doc-reader] no stored pages for %s (id=%s); skipping",
                    file.name,
                    file.id,
                )
                continue
            notes = await self._reasoner.gather_notes(pages, query)
            if not notes:
                continue
            sections.append(f"=== {file.name} ===\n{ChunkedReasoner.format_notes(notes)}")

        if not sections:
            return "Could not read any document content."

        logger.info(
            "[whole-doc-reader] read query=%r files=%d -> %d chars",
            query,
            len(self._files),
            sum(len(s) for s in sections),
        )
        return "\n\n".join(sections)
