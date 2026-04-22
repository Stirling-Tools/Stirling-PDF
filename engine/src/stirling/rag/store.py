from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


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


class VectorStore(ABC):
    """Abstract interface for vector storage backends.

    Implementations must handle persistence, collection management,
    and nearest-neighbor search over pre-computed embeddings.
    """

    @abstractmethod
    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
    ) -> None:
        """Store documents with their embeddings in the named collection."""

    @abstractmethod
    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Return the top_k most similar documents from the collection."""

    @abstractmethod
    async def delete_collection(self, collection: str) -> None:
        """Remove a collection and all its documents."""

    @abstractmethod
    async def list_collections(self) -> list[str]:
        """Return names of all existing collections."""

    @abstractmethod
    async def has_collection(self, collection: str) -> bool:
        """Check whether a collection exists."""
