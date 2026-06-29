from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

from stirling.contracts.documents import Page, PageRange
from stirling.models import OwnerId, PrincipalId


@dataclass
class Document:
    """A chunk of text with metadata, ready for embedding and storage."""

    id: str
    text: str
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass
class SearchResult:
    """A document returned from a vector search with its relevance score."""

    document: Document
    score: float


@dataclass
class StoredPage:
    """A page as written to the store. ``char_count`` is precomputed at ingest."""

    page_number: int
    text: str
    char_count: int


class DocumentStore(ABC):
    """Abstract interface for document storage backends.

    Backends hold two representations of every document:

    * **Vector chunks** - small, embedded chunks used for RAG search.
    * **Ordered pages** - the original page text retained in document order,
      used for whole-document reading.
    """

    # ── lifecycle of the (collection, owner_id) row ────────────────────────

    @abstractmethod
    async def ensure_collection(
        self,
        collection: str,
        source: str,
        owner_id: OwnerId,
        expires_at: datetime | None,
    ) -> None:
        """Upsert the top-level ``documents_meta`` row for ``(collection, owner_id)``.

        Must be called before :meth:`add_pages` or :meth:`add_documents`. Both
        write into child tables that hold a foreign key to the parent row, so
        it must exist first.
        """

    @abstractmethod
    async def delete_collection(self, collection: str, owner_id: OwnerId) -> bool:
        """Remove a collection's chunks, pages, and ACL rows.

        Returns ``True`` when a row matched and was deleted, ``False`` when
        ``(collection, owner_id)`` didn't exist.
        """

    @abstractmethod
    async def purge_owner(self, owner_id: OwnerId) -> int:
        """Remove every collection (and ACL row) belonging to ``owner_id``.
        Returns the number of collections purged.
        """

    @abstractmethod
    async def reap_expired(self) -> int:
        """Remove collections whose ``expires_at`` is non-null and in the past."""

    # ── write paths (scoped by owner) ──────────────────────────────────────

    @abstractmethod
    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
        owner_id: OwnerId,
    ) -> None:
        """Store vector chunks with their embeddings under the owner's collection."""

    @abstractmethod
    async def add_pages(self, collection: str, pages: list[StoredPage], owner_id: OwnerId) -> None:
        """Replace the stored pages for ``(collection, owner_id)`` with the supplied pages."""

    # ── ACL management ─────────────────────────────────────────────────────

    @abstractmethod
    async def grant_read(
        self,
        collection: str,
        owner_id: OwnerId,
        principals: list[PrincipalId],
    ) -> None:
        """Grant read access on ``(collection, owner_id)`` to each principal."""

    @abstractmethod
    async def revoke(
        self,
        collection: str,
        owner_id: OwnerId,
        principal: PrincipalId,
    ) -> None:
        """Remove every permission this principal has on ``(collection, owner_id)``."""

    # ── read paths (scoped by ACL principal set) ───────────────────────────

    @abstractmethod
    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
        principals: list[PrincipalId],
    ) -> list[SearchResult]:
        """Top-k similar vector chunks from ``collection`` that any principal can read.

        Returns an empty list when no principal in ``principals`` has a read
        ACL row for this collection (regardless of which owner backs it).
        """

    @abstractmethod
    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
        principals: list[PrincipalId],
    ) -> list[Page]:
        """Return ordered pages for ``collection``. Empty list when no read ACL match."""

    @abstractmethod
    async def has_collection(self, collection: str, principals: list[PrincipalId]) -> bool:
        """Check whether any principal in ``principals`` can read this collection."""

    @abstractmethod
    async def list_collections(self, principals: list[PrincipalId]) -> list[str]:
        """Return collection names readable by at least one of ``principals``."""

    # ── lifecycle ──────────────────────────────────────────────────────────

    @abstractmethod
    async def close(self) -> None:
        """Release any resources held by the store (connections, handles, etc.)."""
