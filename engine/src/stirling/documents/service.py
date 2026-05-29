from __future__ import annotations

import logging

from stirling.contracts.documents import Page, PageRange, PageText
from stirling.documents.embedder import EmbeddingService
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage
from stirling.models import FileId, UserId

logger = logging.getLogger(__name__)

PAGE_NUMBER_METADATA_KEY = "page_number"
CONTENT_TYPE_METADATA_KEY = "content_type"
PAGE_TEXT_CONTENT_TYPE = "page_text"


class DocumentService:
    """Top-level facade for stored document content.

    Holds two representations of every document under a single ``collection``:

    * **Vector chunks** for RAG-style semantic retrieval (``search``).
    * **Ordered pages** for whole-document reading (``read_pages``).

    Both are populated by :meth:`ingest` from a single ``pages`` payload. Agents
    pick the strategy that fits the question; they don't need to know which
    storage they're hitting.
    """

    def __init__(self, embedder: EmbeddingService, store: DocumentStore, default_top_k: int = 5) -> None:
        self._embedder = embedder
        self._store = store
        self._default_top_k = default_top_k

    async def ingest(
        self,
        collection: FileId,
        pages: list[PageText],
        source: str,
        user_id: UserId,
    ) -> int:
        """Replace-ingest a document. Returns the number of vector chunks indexed.

        This wipes any previously-stored content for ``collection`` under
        ``user_id`` and writes both the vector-chunk and page-text
        representations from the same ``pages`` payload. Pages with
        empty/whitespace-only text are skipped for chunking but still written
        to the page store so page numbering is preserved end-to-end.
        """
        await self._store.delete_collection(collection, user_id)
        await self._store.ensure_collection(collection, source, user_id)

        stored_pages = [StoredPage(page_number=p.page_number, text=p.text, char_count=len(p.text)) for p in pages]
        await self._store.add_pages(collection, stored_pages, user_id)

        chunks: list[Document] = []
        for page in pages:
            if not page.text.strip():
                continue
            chunks.extend(
                self._embedder.chunk_and_prepare(
                    text=page.text,
                    source=f"{source}:page:{page.page_number}",
                    base_metadata={
                        PAGE_NUMBER_METADATA_KEY: str(page.page_number),
                        CONTENT_TYPE_METADATA_KEY: PAGE_TEXT_CONTENT_TYPE,
                    },
                )
            )

        if not chunks:
            return 0
        embeddings = await self._embedder.embed_documents([doc.text for doc in chunks])
        await self._store.add_documents(collection, chunks, embeddings, user_id)
        return len(chunks)

    async def search(
        self,
        query: str,
        user_id: UserId,
        collection: FileId | None = None,
        top_k: int | None = None,
    ) -> list[SearchResult]:
        """Embed query and search ``user_id``'s collections.

        If ``collection`` is supplied, search only that collection. If ``None``,
        merge results across every collection owned by ``user_id``.
        """
        k = top_k if top_k is not None else self._default_top_k
        query_embedding = await self._embedder.embed_query(query)

        if collection is not None:
            if not await self._store.has_collection(collection, user_id):
                return []
            return await self._store.search(collection, query_embedding, k, user_id)

        # Search every collection owned by this user, skipping any that error
        # (e.g. dimension mismatch).
        collections = await self._store.list_collections(user_id)
        all_results: list[SearchResult] = []
        for col_name in collections:
            try:
                results = await self._store.search(col_name, query_embedding, k, user_id)
                all_results.extend(results)
            except Exception:  # noqa: BLE001 - any backend error on one collection should not stop the others
                logger.warning(
                    "Skipping collection %s during cross-collection search for user %s",
                    col_name,
                    user_id,
                    exc_info=True,
                )

        # Sort by score descending, return top_k across all of the user's collections
        all_results.sort(key=lambda r: r.score, reverse=True)
        return all_results[:k]

    async def read_pages(
        self,
        collection: FileId,
        user_id: UserId,
        page_range: PageRange | None = None,
    ) -> list[Page]:
        """Return ordered page text for ``collection`` owned by ``user_id``.

        Empty list if the collection has no stored pages for this user.
        """
        return await self._store.read_pages(collection, page_range, user_id)

    async def delete_collection(self, collection: FileId, user_id: UserId) -> None:
        """Remove a user's collection (chunks and pages)."""
        await self._store.delete_collection(collection, user_id)

    async def has_collection(self, collection: FileId, user_id: UserId) -> bool:
        """Check whether ``user_id`` owns this collection."""
        return await self._store.has_collection(collection, user_id)

    async def list_collections(self, user_id: UserId) -> list[FileId]:
        """List collections owned by ``user_id``."""
        return [FileId(name) for name in await self._store.list_collections(user_id)]

    async def close(self) -> None:
        """Release the underlying store's resources."""
        await self._store.close()
