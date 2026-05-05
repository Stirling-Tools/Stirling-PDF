from __future__ import annotations

import json

import psycopg
from pgvector.psycopg import register_vector_async

from stirling.rag.store import Document, SearchResult, VectorStore


class PgVectorStore(VectorStore):
    """PostgreSQL + pgvector backed store.

    Connects to an external Postgres instance (DSN provided via config) and uses the
    `vector` extension for similarity search. The schema is created on first use.
    """

    def __init__(self, dsn: str) -> None:
        if not dsn:
            raise ValueError("pgvector backend requires a non-empty DSN (STIRLING_RAG_PGVECTOR_DSN)")
        self._dsn = dsn
        self._initialized = False

    async def _connect(self) -> psycopg.AsyncConnection:
        conn = await psycopg.AsyncConnection.connect(self._dsn)
        await register_vector_async(conn)
        return conn

    async def _ensure_schema(self) -> None:
        if self._initialized:
            return
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rag_documents (
                        id TEXT NOT NULL,
                        collection TEXT NOT NULL,
                        text TEXT NOT NULL,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        embedding vector NOT NULL,
                        PRIMARY KEY (id, collection)
                    )
                    """
                )
                await cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_collection ON rag_documents(collection)")
                await conn.commit()
        self._initialized = True

    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
    ) -> None:
        if len(documents) != len(embeddings):
            raise ValueError(f"Got {len(documents)} documents but {len(embeddings)} embeddings")
        if not documents:
            return

        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                for doc, emb in zip(documents, embeddings):
                    await cur.execute(
                        """
                        INSERT INTO rag_documents (id, collection, text, metadata, embedding)
                        VALUES (%s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (id, collection)
                        DO UPDATE SET
                            text = EXCLUDED.text,
                            metadata = EXCLUDED.metadata,
                            embedding = EXCLUDED.embedding
                        """,
                        (doc.id, collection, doc.text, json.dumps(doc.metadata), emb),
                    )
                await conn.commit()

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[SearchResult]:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, text, metadata, 1 - (embedding <=> %s) AS score
                    FROM rag_documents
                    WHERE collection = %s
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    (query_embedding, collection, query_embedding, top_k),
                )
                rows = await cur.fetchall()

        return [
            SearchResult(
                document=Document(id=r[0], text=r[1], metadata=r[2] or {}),
                score=float(r[3]),
            )
            for r in rows
        ]

    async def delete_collection(self, collection: str) -> None:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM rag_documents WHERE collection = %s", (collection,))
                await conn.commit()

    async def list_collections(self) -> list[str]:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT DISTINCT collection FROM rag_documents ORDER BY collection")
                rows = await cur.fetchall()
        return [r[0] for r in rows]

    async def has_collection(self, collection: str) -> bool:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT 1 FROM rag_documents WHERE collection = %s LIMIT 1",
                    (collection,),
                )
                row = await cur.fetchone()
        return row is not None

    async def close(self) -> None:
        # Connections are opened and closed per call, so nothing persistent to release.
        return None
