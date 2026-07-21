from __future__ import annotations

import asyncio
import json
from datetime import datetime

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector_async
from psycopg_pool import AsyncConnectionPool

from stirling.contracts.documents import Page, PageRange
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage
from stirling.models import OwnerId, PrincipalId

_READ_PERMISSION = "read"


async def _register_vector(conn: psycopg.AsyncConnection) -> None:
    await register_vector_async(conn)


class PgVectorStore(DocumentStore):
    """PostgreSQL + pgvector backed store, scoped by owner with ACL-gated reads.

    Connects to an external Postgres instance (DSN provided via config) and uses the
    `vector` extension for similarity search. The schema is created on first use.

    Queries run on a shared async connection pool. The pool is opened lazily on
    first use, after the schema bootstrap, because each pooled connection's
    configure hook registers the ``vector`` type, which must already exist.

    Owned tables:

    * ``documents_meta`` - parent row, one per ``(collection, owner_id)``.
    * ``rag_documents`` - vector chunks for RAG search.
    * ``document_pages`` - ordered page text for whole-document reading.
    * ``document_acl`` - principals (users, groups, orgs) granted permissions
      on a ``(collection, owner_id)`` pair. Read methods take the caller's
      principal set and join through this table.

    Writes are owner-scoped; reads are ACL-scoped.
    """

    def __init__(self, dsn: str, pool_min_size: int, pool_max_size: int) -> None:
        if not dsn:
            raise ValueError("pgvector backend requires a non-empty DSN (STIRLING_DOCUMENTS_PGVECTOR_DSN)")
        self._dsn = dsn
        self._pool = AsyncConnectionPool(
            dsn,
            min_size=pool_min_size,
            max_size=pool_max_size,
            open=False,
            configure=_register_vector,
            check=AsyncConnectionPool.check_connection,
        )
        self._initialized = False
        self._init_lock = asyncio.Lock()

    async def _ensure_ready(self) -> None:
        """Create the schema and open the pool, exactly once across concurrent callers."""
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            await self._bootstrap_schema()
            await self._pool.open()
            self._initialized = True

    async def _bootstrap_schema(self) -> None:
        # The `vector` type must exist before the pool's configure hook
        # (register_vector_async) can resolve it, and on a fresh database it doesn't
        # yet. Create the extension + schema on a raw, non-pool connection that hasn't
        # registered the type; _ensure_ready then opens the pool, whose configure hook
        # registers the now-existing type per connection.
        async with await psycopg.AsyncConnection.connect(self._dsn) as conn:
            async with conn.cursor() as cur:
                await cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS documents_meta (
                        collection TEXT NOT NULL,
                        owner_id TEXT NOT NULL,
                        source TEXT NOT NULL,
                        expires_at TIMESTAMP WITH TIME ZONE,
                        PRIMARY KEY (collection, owner_id)
                    )
                    """
                )
                # Partial index over rows that can actually expire keeps the reaper
                # scan tight even when most rows are persistent (org docs).
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_meta_expires_at "
                    "ON documents_meta(expires_at) WHERE expires_at IS NOT NULL"
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rag_documents (
                        id TEXT NOT NULL,
                        collection TEXT NOT NULL,
                        owner_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        embedding vector NOT NULL,
                        PRIMARY KEY (id, collection, owner_id),
                        FOREIGN KEY (collection, owner_id)
                            REFERENCES documents_meta(collection, owner_id) ON DELETE CASCADE
                    )
                    """
                )
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_rag_collection_owner ON rag_documents(collection, owner_id)"
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS document_pages (
                        collection TEXT NOT NULL,
                        owner_id TEXT NOT NULL,
                        page_number INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        char_count INTEGER NOT NULL,
                        PRIMARY KEY (collection, owner_id, page_number),
                        FOREIGN KEY (collection, owner_id)
                            REFERENCES documents_meta(collection, owner_id) ON DELETE CASCADE
                    )
                    """
                )
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_pages_collection_owner ON document_pages(collection, owner_id)"
                )
                await cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS document_acl (
                        collection TEXT NOT NULL,
                        owner_id TEXT NOT NULL,
                        principal_id TEXT NOT NULL,
                        permission TEXT NOT NULL,
                        PRIMARY KEY (collection, owner_id, principal_id, permission),
                        FOREIGN KEY (collection, owner_id)
                            REFERENCES documents_meta(collection, owner_id) ON DELETE CASCADE
                    )
                    """
                )
                # Hot path: every read joins ``WHERE principal_id = ANY(...) AND permission = ?``.
                await cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_acl_principal_permission ON document_acl(principal_id, permission)"
                )
                await conn.commit()

    # ── lifecycle of the (collection, owner_id) row ────────────────────────

    async def ensure_collection(
        self,
        collection: str,
        source: str,
        owner_id: OwnerId,
        expires_at: datetime | None,
    ) -> None:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO documents_meta (collection, owner_id, source, expires_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (collection, owner_id) DO UPDATE SET
                        source = EXCLUDED.source,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (collection, owner_id, source, expires_at),
                )
                await conn.commit()

    async def purge_owner(self, owner_id: OwnerId) -> int:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM documents_meta WHERE owner_id = %s",
                    (owner_id,),
                )
                deleted = cur.rowcount
                await conn.commit()
        return deleted

    async def reap_expired(self) -> int:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM documents_meta WHERE expires_at IS NOT NULL AND expires_at < NOW()")
                deleted = cur.rowcount
                await conn.commit()
        return deleted

    async def delete_collection(self, collection: str, owner_id: OwnerId) -> bool:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                # Cascade FKs handle rag_documents, document_pages, document_acl.
                await cur.execute(
                    "DELETE FROM documents_meta WHERE collection = %s AND owner_id = %s",
                    (collection, owner_id),
                )
                deleted = cur.rowcount > 0
                await conn.commit()
        return deleted

    # ── write paths ────────────────────────────────────────────────────────

    async def add_documents(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
        owner_id: OwnerId,
    ) -> None:
        if len(documents) != len(embeddings):
            raise ValueError(f"Got {len(documents)} documents but {len(embeddings)} embeddings")
        if not documents:
            return

        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                for doc, emb in zip(documents, embeddings):
                    await cur.execute(
                        """
                        INSERT INTO rag_documents (id, collection, owner_id, text, metadata, embedding)
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (id, collection, owner_id)
                        DO UPDATE SET
                            text = EXCLUDED.text,
                            metadata = EXCLUDED.metadata,
                            embedding = EXCLUDED.embedding
                        """,
                        (doc.id, collection, owner_id, doc.text, json.dumps(doc.metadata), Vector(emb)),
                    )
                await conn.commit()

    async def add_pages(self, collection: str, pages: list[StoredPage], owner_id: OwnerId) -> None:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM document_pages WHERE collection = %s AND owner_id = %s",
                    (collection, owner_id),
                )
                if pages:
                    await cur.executemany(
                        """
                        INSERT INTO document_pages (collection, owner_id, page_number, text, char_count)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        [(collection, owner_id, p.page_number, p.text, p.char_count) for p in pages],
                    )
                await conn.commit()

    # ── ACL management ─────────────────────────────────────────────────────

    async def grant_read(
        self,
        collection: str,
        owner_id: OwnerId,
        principals: list[PrincipalId],
    ) -> None:
        if not principals:
            return
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO document_acl (collection, owner_id, principal_id, permission)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (collection, owner_id, principal_id, permission) DO NOTHING
                    """,
                    [(collection, owner_id, p, _READ_PERMISSION) for p in principals],
                )
                await conn.commit()

    async def revoke(
        self,
        collection: str,
        owner_id: OwnerId,
        principal: PrincipalId,
    ) -> None:
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM document_acl WHERE collection = %s AND owner_id = %s AND principal_id = %s",
                    (collection, owner_id, principal),
                )
                await conn.commit()

    # ── read paths (ACL-gated) ─────────────────────────────────────────────

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
        principals: list[PrincipalId],
    ) -> list[SearchResult]:
        if not principals:
            return []
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                owner_id = await self._readable_owner_for(cur, collection, principals)
                if owner_id is None:
                    return []
                query_vec = Vector(query_embedding)
                await cur.execute(
                    """
                    SELECT id, text, metadata, 1 - (embedding <=> %s) AS score
                    FROM rag_documents
                    WHERE collection = %s AND owner_id = %s
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    (query_vec, collection, owner_id, query_vec, top_k),
                )
                rows = await cur.fetchall()

        return [
            SearchResult(
                document=Document(id=r[0], text=r[1], metadata=r[2] or {}),
                score=float(r[3]),
            )
            for r in rows
        ]

    @staticmethod
    async def _readable_owner_for(
        cur: psycopg.AsyncCursor,
        collection: str,
        principals: list[PrincipalId],
    ) -> str | None:
        """Resolve which owner_id this caller is reading. ``None`` means no access."""
        await cur.execute(
            """
            SELECT owner_id FROM document_acl
            WHERE collection = %s
              AND permission = %s
              AND principal_id = ANY(%s)
            ORDER BY owner_id
            LIMIT 1
            """,
            (collection, _READ_PERMISSION, list(principals)),
        )
        row = await cur.fetchone()
        return row[0] if row else None

    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
        principals: list[PrincipalId],
    ) -> list[Page]:
        if not principals:
            return []
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                owner_id = await self._readable_owner_for(cur, collection, principals)
                if owner_id is None:
                    return []
                if page_range is None:
                    await cur.execute(
                        "SELECT page_number, text, char_count FROM document_pages "
                        "WHERE collection = %s AND owner_id = %s ORDER BY page_number",
                        (collection, owner_id),
                    )
                else:
                    await cur.execute(
                        "SELECT page_number, text, char_count FROM document_pages "
                        "WHERE collection = %s AND owner_id = %s "
                        "AND page_number BETWEEN %s AND %s "
                        "ORDER BY page_number",
                        (collection, owner_id, page_range.start, page_range.end),
                    )
                rows = await cur.fetchall()
        return [Page(page_number=r[0], text=r[1], char_count=r[2]) for r in rows]

    async def has_collection(self, collection: str, principals: list[PrincipalId]) -> bool:
        if not principals:
            return False
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                owner_id = await self._readable_owner_for(cur, collection, principals)
                return owner_id is not None

    async def list_collections(self, principals: list[PrincipalId]) -> list[str]:
        if not principals:
            return []
        await self._ensure_ready()
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT DISTINCT collection FROM document_acl
                    WHERE permission = %s
                      AND principal_id = ANY(%s)
                    ORDER BY collection
                    """,
                    (_READ_PERMISSION, list(principals)),
                )
                rows = await cur.fetchall()
        return [r[0] for r in rows]

    async def close(self) -> None:
        await self._pool.close()
