from __future__ import annotations

from collections.abc import Awaitable, Callable

from pydantic_ai import FunctionToolset
from pydantic_ai.toolsets import AbstractToolset

from stirling.rag.service import RagService


class RagCapability:
    """Bundles RAG instructions and the ``search_knowledge`` toolset for agent injection.

    Agents consume this as::

        rag = runtime.rag_capability
        Agent(
            ...,
            instructions=rag.instructions if rag else None,
            toolsets=[rag.toolset] if rag else [],
        )

    When no collections are pinned, the instructions are generated dynamically at
    run time so the agent sees the current list of collections in the store.
    """

    def __init__(
        self,
        rag_service: RagService,
        collections: list[str] | None = None,
        top_k: int = 5,
    ) -> None:
        self._rag_service = rag_service
        self._collections = collections
        self._top_k = top_k

    @property
    def instructions(self) -> str | Callable[[], Awaitable[str]]:
        if self._collections:
            collection_desc = f"collections: {', '.join(self._collections)}"
            return (
                "You have access to a knowledge base search tool called 'search_knowledge'. "
                f"It searches {collection_desc} for relevant information. "
                "Use it when the provided context is insufficient to answer the user's question, "
                "or when you think additional background information would improve your answer. "
                "You do not have to use it if the answer is already clear from the provided text."
            )

        rag_service = self._rag_service

        async def _dynamic_instructions() -> str:
            collections = await rag_service.list_collections()
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

        return _dynamic_instructions

    @property
    def toolset(self) -> AbstractToolset[None]:
        toolset: FunctionToolset[None] = FunctionToolset()

        rag_service = self._rag_service
        collections = self._collections
        top_k = self._top_k

        @toolset.tool_plain
        async def search_knowledge(query: str, max_results: int = top_k) -> str:
            """Search the knowledge base for information relevant to the query.

            Args:
                query: The search query describing what information you need.
                max_results: Maximum number of results to return (default 5).

            Returns:
                Formatted text with the most relevant knowledge base excerpts.
            """
            if collections:
                all_results = []
                for col in collections:
                    results = await rag_service.search(query, collection=col, top_k=max_results)
                    all_results.extend(results)
                all_results.sort(key=lambda r: r.score, reverse=True)
                results = all_results[:max_results]
            else:
                results = await rag_service.search(query, top_k=max_results)

            if not results:
                return "No relevant results found in the knowledge base."

            sections = []
            for i, result in enumerate(results, 1):
                source = result.document.metadata.get("source", "unknown")
                chunk_idx = result.document.metadata.get("chunk_index", "?")
                score = f"{result.score:.3f}"
                sections.append(
                    f"[Result {i} | source: {source}, chunk: {chunk_idx}, relevance: {score}]\n"
                    f"{result.document.text}"
                )
            return "\n\n---\n\n".join(sections)

        return toolset
