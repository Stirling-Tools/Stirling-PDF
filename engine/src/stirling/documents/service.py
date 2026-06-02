from __future__ import annotations

import logging
from datetime import datetime

from stirling.contracts.documents import Page, PageRange, PageText
from stirling.documents.embedder import EmbeddingService
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage
from stirling.models import FileId, OwnerId, PrincipalId

logger = logging.getLogger(__name__)

PAGE_NUMBER_METADATA_KEY = "page_number"
CONTENT_TYPE_METADATA_KEY = "content_type"
PAGE_TEXT_CONTENT_TYPE = "page_text"


class DocumentService:
    """Top-level facade for stored document content.

    Holds two representations of every document under a single
    ``(collection, owner_id)`` pair:

    * **Vector chunks** for RAG-style semantic retrieval (``search``).
    * **Ordered pages** for whole-document reading (``read_pages``).

    Both are populated by :meth:`ingest` from a single ``pages`` payload. Agents
    pick the strategy that fits the question; they don't need to know which
    storage they're hitting.

    **Owner vs principal.** ``owner_id`` is the tenant (a user or an org).
    ``principals`` is the caller's accessible principal set, matched against
    the ACL on every read. Personal-doc behaviour: ingest with
    ``owner_id=user:bob`` and the route grants ``user:bob`` read access; Bob's
    later searches pass ``principals=[user:bob]`` and find his docs.
    Org-doc behaviour: ingest with ``owner_id=org:acme`` and grant read to
    whichever groups should see it (``group:engineering``, etc.); members'
    principal sets pick the doc up automatically.
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
        owner_id: OwnerId,
        read_principals: list[PrincipalId],
        expires_at: datetime | None,
    ) -> int:
        """Replace-ingest a document. Returns the number of vector chunks indexed.

        Wipes any previously-stored content for ``(collection, owner_id)`` and
        writes both the vector-chunk and page-text representations from the
        same ``pages`` payload. Pages with empty/whitespace-only text are
        skipped for chunking but still written to the page store so page
        numbering is preserved end-to-end.
        """
        if not read_principals:
            raise ValueError("read_principals must not be empty - every doc needs at least one reader")

        await self._store.delete_collection(collection, owner_id)
        await self._store.ensure_collection(collection, source, owner_id, expires_at)

        stored_pages = [StoredPage(page_number=p.page_number, text=p.text, char_count=len(p.text)) for p in pages]
        await self._store.add_pages(collection, stored_pages, owner_id)
        await self._store.grant_read(collection, owner_id, read_principals)

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
        await self._store.add_documents(collection, chunks, embeddings, owner_id)
        return len(chunks)

    async def search(
        self,
        query: str,
        principals: list[PrincipalId],
        collection: FileId | None = None,
        top_k: int | None = None,
    ) -> list[SearchResult]:
        """Embed query and search collections readable by ``principals``.

        If ``collection`` is supplied, search only that collection (and only
        if at least one principal can read it). If ``None``, search every
        collection any principal in ``principals`` can read, merge, and
        return the top-k.
        """
        k = top_k if top_k is not None else self._default_top_k
        query_embedding = await self._embedder.embed_query(query)

        if collection is not None:
            if not await self._store.has_collection(collection, principals):
                return []
            return await self._store.search(collection, query_embedding, k, principals)

        # Search every collection the caller can read, skipping any that error
        # (e.g. dimension mismatch).
        collections = await self._store.list_collections(principals)
        all_results: list[SearchResult] = []
        for col_name in collections:
            try:
                results = await self._store.search(col_name, query_embedding, k, principals)
                all_results.extend(results)
            except Exception:  # noqa: BLE001 - any backend error on one collection should not stop the others
                logger.warning(
                    "Skipping collection %s during cross-collection search",
                    col_name,
                    exc_info=True,
                )

        # Sort by score descending, return top_k across all the caller's collections
        all_results.sort(key=lambda r: r.score, reverse=True)
        return all_results[:k]

    async def read_pages(
        self,
        collection: FileId,
        principals: list[PrincipalId],
        page_range: PageRange | None = None,
    ) -> list[Page]:
        """Return ordered page text for ``collection`` if any principal can read it."""
        return await self._store.read_pages(collection, page_range, principals)

    async def delete_collection(self, collection: FileId, owner_id: OwnerId) -> bool:
        """Remove a collection (chunks, pages, ACL).

        Returns ``True`` if the collection was found and deleted, ``False`` if
        no row matched ``(collection, owner_id)``.
        """
        return await self._store.delete_collection(collection, owner_id)

    async def purge_owner(self, owner_id: OwnerId) -> int:
        """Remove every collection ``owner_id`` owns, including vector chunks,
        page text, and ACL rows. Returns the number of collections purged."""
        return await self._store.purge_owner(owner_id)

    async def reap_expired(self) -> int:
        """Delete collections whose ``expires_at`` is set and in the past.
        Persistent collections (``expires_at=null``) are never touched.
        Returns the number of collections deleted."""
        return await self._store.reap_expired()

    async def has_collection(self, collection: FileId, principals: list[PrincipalId]) -> bool:
        """Check whether at least one principal can read this collection."""
        return await self._store.has_collection(collection, principals)

    async def list_collections(self, principals: list[PrincipalId]) -> list[FileId]:
        """List collections readable by at least one of ``principals``."""
        return [FileId(name) for name in await self._store.list_collections(principals)]

    async def grant_read(
        self,
        collection: FileId,
        owner_id: OwnerId,
        principals: list[PrincipalId],
    ) -> None:
        """Grant read access to additional principals on an existing doc."""
        await self._store.grant_read(collection, owner_id, principals)

    async def revoke(
        self,
        collection: FileId,
        owner_id: OwnerId,
        principal: PrincipalId,
    ) -> None:
        """Revoke a principal's access on an existing doc."""
        await self._store.revoke(collection, owner_id, principal)

    async def close(self) -> None:
        """Release the underlying store's resources."""
        await self._store.close()
