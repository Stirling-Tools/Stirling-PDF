from __future__ import annotations

import json

import psycopg
from pgvector.psycopg import register_vector_async

from stirling.contracts.documents import Page, PageRange
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage
from stirling.models import UserId


class PgVectorStore(DocumentStore):
    """PostgreSQL + pgvector backed store, scoped per user.

    Connects to an external Postgres instance (DSN provided via config) and uses the
    `vector` extension for similarity search. The schema is created on first use.

    Holds two tables under the same connection:

    * ``rag_documents`` - vector chunks for RAG search.
    * ``document_pages`` - ordered page text for whole-document reading.

    Both child tables foreign-key to ``documents_meta`` on ``(collection, user_id)``
    so cascade deletes still clean up everything for a given document. Every read
    and write is filtered by ``user_id``: the same ``collection`` value from two
    different users coexists as two independent rows and is never returned across
    the tenancy boundary.
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
                    CREATE TABLE IF NOT EXISTS documents_meta (
                        collection TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        source TEXT NOT NULL,
                        PRIMARY KEY (collection, user_id)
                    )
                    """
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rag_documents (
                        id TEXT NOT NULL,
                        collection TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        embedding vector NOT NULL,
                        PRIMARY KEY (id, collection, user_id),
                        FOREIGN KEY (collection, user_id)
                            REFERENCES documents_meta(collection, user_id) ON DELETE CASCADE
                    )
                    """
                )
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_rag_collection_user ON rag_documents(collection, user_id)"
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS document_pages (
                        collection TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        page_number INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        char_count INTEGER NOT NULL,
                        PRIMARY KEY (collection, user_id, page_number),
                        FOREIGN KEY (collection, user_id)
                            REFERENCES documents_meta(collection, user_id) ON DELETE CASCADE
                    )
                    """
                )
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pages_collection_user ON document_pages(collection, user_id)"
                )
                await conn.commit()
        self._initialized = True

    async def ensure_collection(self, collection: str, source: str, user_id: UserId) -> None:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO documents_meta (collection, user_id, source)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (collection, user_id) DO UPDATE SET source = EXCLUDED.source
                    """,
                    (collection, user_id, source),
                )
                await conn.commit()

    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
        user_id: UserId,
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
                        INSERT INTO rag_documents (id, collection, user_id, text, metadata, embedding)
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (id, collection, user_id)
                        DO UPDATE SET
                            text = EXCLUDED.text,
                            metadata = EXCLUDED.metadata,
                            embedding = EXCLUDED.embedding
                        """,
                        (doc.id, collection, user_id, doc.text, json.dumps(doc.metadata), emb),
                    )
                await conn.commit()

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
        user_id: UserId,
    ) -> list[SearchResult]:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, text, metadata, 1 - (embedding <=> %s) AS score
                    FROM rag_documents
                    WHERE collection = %s AND user_id = %s
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    (query_embedding, collection, user_id, query_embedding, top_k),
                )
                rows = await cur.fetchall()

        return [
            SearchResult(
                document=Document(id=r[0], text=r[1], metadata=r[2] or {}),
                score=float(r[3]),
            )
            for r in rows
        ]

    async def add_pages(self, collection: str, pages: list[StoredPage], user_id: UserId) -> None:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM document_pages WHERE collection = %s AND user_id = %s",
                    (collection, user_id),
                )
                if pages:
                    await cur.executemany(
                        """
                        INSERT INTO document_pages (collection, user_id, page_number, text, char_count)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        [(collection, user_id, p.page_number, p.text, p.char_count) for p in pages],
                    )
                await conn.commit()

    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
        user_id: UserId,
    ) -> list[Page]:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                if page_range is None:
                    await cur.execute(
                        "SELECT page_number, text, char_count FROM document_pages "
                        "WHERE collection = %s AND user_id = %s ORDER BY page_number",
                        (collection, user_id),
                    )
                else:
                    await cur.execute(
                        "SELECT page_number, text, char_count FROM document_pages "
                        "WHERE collection = %s AND user_id = %s "
                        "AND page_number BETWEEN %s AND %s "
                        "ORDER BY page_number",
                        (collection, user_id, page_range.start, page_range.end),
                    )
                rows = await cur.fetchall()
        return [Page(page_number=r[0], text=r[1], char_count=r[2]) for r in rows]

    async def delete_collection(self, collection: str, user_id: UserId) -> None:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                # Cascade FKs handle rag_documents and document_pages.
                await cur.execute(
                    "DELETE FROM documents_meta WHERE collection = %s AND user_id = %s",
                    (collection, user_id),
                )
                await conn.commit()

    async def list_collections(self, user_id: UserId) -> list[str]:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT collection FROM documents_meta WHERE user_id = %s ORDER BY collection",
                    (user_id,),
                )
                rows = await cur.fetchall()
        return [r[0] for r in rows]

    async def has_collection(self, collection: str, user_id: UserId) -> bool:
        await self._ensure_schema()
        async with await self._connect() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT 1 FROM documents_meta WHERE collection = %s AND user_id = %s",
                    (collection, user_id),
                )
                row = await cur.fetchone()
        return row is not None

    async def close(self) -> None:
        # Connections are opened and closed per call, so nothing persistent to release.
        return None
