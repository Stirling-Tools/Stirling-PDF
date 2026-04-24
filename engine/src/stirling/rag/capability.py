from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from pydantic_ai import FunctionToolset
from pydantic_ai.toolsets import AbstractToolset

from stirling.models import FileId
from stirling.rag.service import RagService
from stirling.rag.store import SearchResult

logger = logging.getLogger(__name__)


class RagCapability:
    """Bundles RAG instructions and the ``search_knowledge`` toolset for agent injection.

    Agents consume this as::

        rag = runtime.rag_capability
        Agent(
            ...,
            instructions=rag.instructions,
            toolsets=[rag.toolset],
        )

    When no collections are pinned, the instructions are generated dynamically at
    run time so the agent sees the current list of collections in the store.
    """

    def __init__(
        self,
        rag_service: RagService,
        collections: list[FileId] | None = None,
        top_k: int = 5,
    ) -> None:
        self._rag_service = rag_service
        self._collections = collections
        self._top_k = top_k
        toolset: FunctionToolset[None] = FunctionToolset()
        toolset.add_function(self._search_knowledge, name="search_knowledge")
        self._toolset = toolset

    @property
    def instructions(self) -> str | Callable[[], Awaitable[str]]:
        if self._collections:
            return self._static_instructions_text(self._collections)
        return self._dynamic_instructions

    @property
    def toolset(self) -> AbstractToolset[None]:
        return self._toolset

    @staticmethod
    def _static_instructions_text(collections: list[FileId]) -> str:
        collection_desc = f"collections: {', '.join(collections)}"
        return (
            "You have access to a knowledge base search tool called 'search_knowledge'. "
            f"It searches {collection_desc} for relevant information. "
            "Use it when the provided context is insufficient to answer the user's question, "
            "or when you think additional background information would improve your answer. "
            "You do not have to use it if the answer is already clear from the provided text."
        )

    async def _dynamic_instructions(self) -> str:
        collections = await self._rag_service.list_collections()
        if collections:
            names = ", ".join(collections)
            collection_desc = f"the following knowledge base collections: {names}"
        else:
            collection_desc = "the knowledge base (currently empty — no collections indexed yet)"
        return (
            "You have access to a knowledge base search tool called 'search_knowledge'. "
            f"It searches {collection_desc} for relevant information. "
            "Use it when the provided context is insufficient to answer the user's question, "
            "or when you think additional background information would improve your answer. "
            "You do not have to use it if the answer is already clear from the provided text."
        )

    async def _search_knowledge(self, query: str, max_results: int | None = None) -> str:
        """Search the knowledge base for information relevant to the query.

        Args:
            query: The search query describing what information you need.
            max_results: Maximum number of results to return.

        Returns:
            Formatted text with the most relevant knowledge base excerpts.
        """
        k = max_results if max_results is not None else self._top_k
        if self._collections:
            all_results = []
            for col in self._collections:
                col_results = await self._rag_service.search(query, collection=col, top_k=k)
                all_results.extend(col_results)
            all_results.sort(key=lambda r: r.score, reverse=True)
            results = all_results[:k]
        else:
            results = await self._rag_service.search(query, top_k=k)

        if not results:
            logger.info("[rag] search_knowledge query=%r -> 0 results", query)
            return "No relevant results found in the knowledge base."

        formatted = self._format_results(results)
        logger.info(
            "[rag] search_knowledge query=%r -> %d results, %d chars",
            query,
            len(results),
            len(formatted),
        )
        logger.debug("[rag] search_knowledge query=%r returned:\n%s", query, formatted)
        return formatted

    @staticmethod
    def _format_results(results: list[SearchResult]) -> str:
        sections = []
        for i, result in enumerate(results, 1):
            source = result.document.metadata.get("source", "unknown")
            chunk_idx = result.document.metadata.get("chunk_index", "?")
            score = f"{result.score:.3f}"
            sections.append(
                f"[Result {i} | source: {source}, chunk: {chunk_idx}, relevance: {score}]\n{result.document.text}"
            )
        return "\n\n---\n\n".join(sections)
