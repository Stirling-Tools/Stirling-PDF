from __future__ import annotations

from pydantic_ai import Embedder

from stirling.rag.chunker import chunk_text
from stirling.rag.store import Document

# Keep each upstream embed request under every major provider's per-call limit while
# still batching large enough that a book-sized document ingests in a reasonable number
# of round trips. VoyageAI caps at 1000, OpenAI at 2048, Cohere at 96; 256 is a good
# default for Voyage/OpenAI. Cohere users should pass a lower value via construction.
DEFAULT_EMBED_BATCH_SIZE = 256


class EmbeddingService:
    """Wraps Pydantic AI's Embedder to provide document chunking and embedding."""

    def __init__(
        self,
        model_name: str,
        chunk_size: int = 512,
        chunk_overlap: int = 64,
        embed_batch_size: int = DEFAULT_EMBED_BATCH_SIZE,
    ) -> None:
        self._embedder = Embedder(model_name)
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap
        self._embed_batch_size = embed_batch_size

    async def embed_query(self, text: str) -> list[float]:
        """Embed a search query, optimised for retrieval."""
        result = await self._embedder.embed_query(text)
        return list(result.embeddings[0])

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple document texts for indexing.

        Splits the input into batches of ``embed_batch_size`` so callers can hand us
        any number of chunks without hitting provider per-request limits.
        """
        if not texts:
            return []
        all_embeddings: list[list[float]] = []
        for start in range(0, len(texts), self._embed_batch_size):
            batch = texts[start : start + self._embed_batch_size]
            result = await self._embedder.embed_documents(batch)
            all_embeddings.extend(list(emb) for emb in result.embeddings)
        return all_embeddings

    def chunk_and_prepare(
        self,
        text: str,
        source: str = "",
        base_metadata: dict[str, str] | None = None,
    ) -> list[Document]:
        """Chunk text and return Document objects ready for embedding.

        Each chunk gets a unique ID based on source and chunk index.
        """
        chunks = chunk_text(text, self._chunk_size, self._chunk_overlap)
        documents: list[Document] = []
        for i, chunk in enumerate(chunks):
            meta = dict(base_metadata) if base_metadata else {}
            meta["source"] = source
            meta["chunk_index"] = str(i)
            doc_id = f"{source}:chunk:{i}" if source else f"chunk:{i}"
            documents.append(Document(id=doc_id, text=chunk, metadata=meta))
        return documents
