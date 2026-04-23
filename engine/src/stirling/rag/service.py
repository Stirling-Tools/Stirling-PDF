from __future__ import annotations

import logging

from stirling.rag.embedder import EmbeddingService
from stirling.rag.store import Document, SearchResult, VectorStore

logger = logging.getLogger(__name__)


class RagService:
    """Orchestrates embedding and vector storage for RAG workflows."""

    def __init__(self, embedder: EmbeddingService, store: VectorStore, default_top_k: int = 5) -> None:
        self._embedder = embedder
        self._store = store
        self._default_top_k = default_top_k

    async def index_text(
        self,
        collection: str,
        text: str,
        source: str = "",
        metadata: dict[str, str] | None = None,
    ) -> int:
        """Chunk, embed, and store text. Returns the number of chunks indexed."""
        documents = self._embedder.chunk_and_prepare(text, source=source, base_metadata=metadata)
        if not documents:
            return 0
        embeddings = await self._embedder.embed_documents([doc.text for doc in documents])
        await self._store.add_documents(collection, documents, embeddings)
        return len(documents)

    async def index_documents(self, collection: str, documents: list[Document]) -> int:
        """Embed and store pre-chunked documents. Returns the number stored."""
        if not documents:
            return 0
        embeddings = await self._embedder.embed_documents([doc.text for doc in documents])
        await self._store.add_documents(collection, documents, embeddings)
        return len(documents)

    async def search(
        self,
        query: str,
        collection: str | None = None,
        top_k: int | None = None,
    ) -> list[SearchResult]:
        """Embed query and search across one or all collections.

        If collection is None, searches all available collections and merges results.
        """
        k = top_k if top_k is not None else self._default_top_k
        query_embedding = await self._embedder.embed_query(query)

        if collection is not None:
            if not await self._store.has_collection(collection):
                return []
            return await self._store.search(collection, query_embedding, k)

        # Search all collections, skipping any that error (e.g. dimension mismatch)
        collections = await self._store.list_collections()
        all_results: list[SearchResult] = []
        for col_name in collections:
            try:
                results = await self._store.search(col_name, query_embedding, k)
                all_results.extend(results)
            except Exception:  # noqa: BLE001 — any backend error on one collection should not stop the others
                logger.warning("Skipping collection %s during cross-collection search", col_name, exc_info=True)

        # Sort by score descending, return top_k across all collections
        all_results.sort(key=lambda r: r.score, reverse=True)
        return all_results[:k]

    async def delete_collection(self, collection: str) -> None:
        """Remove a collection and all its documents."""
        await self._store.delete_collection(collection)

    async def has_collection(self, collection: str) -> bool:
        """Check whether a collection exists."""
        return await self._store.has_collection(collection)

    async def list_collections(self) -> list[str]:
        """List all available collections."""
        return await self._store.list_collections()
