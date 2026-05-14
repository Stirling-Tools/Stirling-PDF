from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from stirling.contracts.documents import Page, PageRange


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

    Both representations live under the same ``collection`` (file id) and are
    rooted at a single parent row in ``documents_meta``. Removing that parent
    row cascades to both child representations, so :meth:`delete_collection`
    is one logical delete.
    """

    @abstractmethod
    async def ensure_collection(self, collection: str, source: str) -> None:
        """Upsert the top-level ``documents_meta`` row for this collection.

        Must be called before :meth:`add_pages` or :meth:`add_documents`. Both
        of those write into child tables that hold a foreign key to the parent
        row, so it must exist first.
        """

    @abstractmethod
    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
    ) -> None:
        """Store vector chunks with their embeddings in the named collection."""

    @abstractmethod
    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Return the top_k most similar vector chunks from the collection."""

    @abstractmethod
    async def add_pages(self, collection: str, pages: list[StoredPage]) -> None:
        """Replace the stored pages for ``collection`` with the supplied pages.

        Implementations must remove any previously-stored pages for the
        collection before writing, so callers can re-ingest by calling this
        method again.
        """

    @abstractmethod
    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None = None,
    ) -> list[Page]:
        """Return ordered pages for ``collection``.

        If ``page_range`` is ``None`` all pages are returned. Otherwise only
        pages whose ``page_number`` falls within the inclusive range are
        returned. Pages are always ordered by ``page_number`` ascending.
        """

    @abstractmethod
    async def delete_collection(self, collection: str) -> None:
        """Remove a collection's chunks and pages."""

    @abstractmethod
    async def list_collections(self) -> list[str]:
        """Return names of all existing collections."""

    @abstractmethod
    async def has_collection(self, collection: str) -> bool:
        """Check whether a collection exists."""

    @abstractmethod
    async def close(self) -> None:
        """Release any resources held by the store (connections, handles, etc.)."""
