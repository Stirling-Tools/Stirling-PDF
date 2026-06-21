from __future__ import annotations

import asyncio
import json
import math
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import sqlite_vec

from stirling.contracts.documents import Page, PageRange
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage
from stirling.models import OwnerId, PrincipalId

_READ_PERMISSION = "read"
# sqlite stores TIMESTAMP as TEXT. We normalise to UTC ISO 8601 ``YYYY-MM-DD HH:MM:SS``
# so lexicographic comparison against ``datetime('now')`` matches chronological order.
_SQLITE_DATETIME_FMT = "%Y-%m-%d %H:%M:%S"


def _to_sqlite_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt.strftime(_SQLITE_DATETIME_FMT)


class SqliteVecStore(DocumentStore):
    """sqlite-vec backed vector store. Single-file SQLite database, embedded, no server.

    Each ``(collection, owner_id)`` pair gets its own `vec0` virtual table with a
    fixed embedding dimension (detected on first insert). Document metadata lives
    in a regular table joined by rowid.
    """

    def __init__(self, db_path: str | Path) -> None:
        is_memory = str(db_path) == ":memory:"
        self._db_path: Path | None = None if is_memory else Path(db_path)

        if self._db_path is not None:
            self._db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        else:
            conn = sqlite3.connect(":memory:", check_same_thread=False)

        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        # Required so cascade deletes from documents_meta clean up child tables.
        conn.execute("PRAGMA foreign_keys=ON")
        if self._db_path is not None:
            conn.execute("PRAGMA journal_mode=WAL")

        self._conn = conn
        self._lock = asyncio.Lock()
        self._init_schema()

    @classmethod
    def ephemeral(cls) -> SqliteVecStore:
        """In-memory store for testing."""
        return cls(":memory:")

    def _init_schema(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents_meta (
                collection TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                source TEXT NOT NULL,
                expires_at TIMESTAMP,
                PRIMARY KEY (collection, owner_id)
            )
            """
        )
        # The reaper filters on ``expires_at IS NOT NULL AND expires_at < now`` so
        # a partial index over non-null rows keeps the scan tight even when most
        # rows are persistent (org docs).
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_meta_expires_at ON documents_meta(expires_at) WHERE expires_at IS NOT NULL"
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS collections (
                collection TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                dim INTEGER NOT NULL,
                table_name TEXT NOT NULL,
                PRIMARY KEY (collection, owner_id),
                FOREIGN KEY (collection, owner_id)
                    REFERENCES documents_meta(collection, owner_id) ON DELETE CASCADE
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT NOT NULL,
                collection TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                text TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                vec_rowid INTEGER NOT NULL,
                PRIMARY KEY (id, collection, owner_id),
                FOREIGN KEY (collection, owner_id)
                    REFERENCES documents_meta(collection, owner_id) ON DELETE CASCADE
            )
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_doc_collection_owner ON documents(collection, owner_id)")
        self._conn.execute(
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
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pages_collection_owner ON document_pages(collection, owner_id)"
        )
        self._conn.execute(
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
        # Lookup by principal is the hot path for search/list (every read
        # joins through this index). Composite ordering matches the WHERE.
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_acl_principal_permission ON document_acl(principal_id, permission)"
        )
        self._conn.commit()

    # ── lifecycle of the (collection, owner_id) row ────────────────────────

    async def ensure_collection(
        self,
        collection: str,
        source: str,
        owner_id: OwnerId,
        expires_at: datetime | None,
    ) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_ensure_collection, collection, source, owner_id, expires_at)

    def _sync_ensure_collection(
        self,
        collection: str,
        source: str,
        owner_id: OwnerId,
        expires_at: datetime | None,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO documents_meta(collection, owner_id, source, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(collection, owner_id) DO UPDATE SET
                source = excluded.source,
                expires_at = excluded.expires_at
            """,
            (collection, owner_id, source, _to_sqlite_utc(expires_at)),
        )
        self._conn.commit()

    async def delete_collection(self, collection: str, owner_id: OwnerId) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._sync_delete_collection, collection, owner_id)

    def _sync_delete_collection(self, collection: str, owner_id: OwnerId) -> bool:
        # Drop the sqlite-vec virtual table first; FK cascade handles the regular tables
        # (collections, documents, document_pages, document_acl) when documents_meta is deleted.
        row = self._conn.execute(
            "SELECT table_name FROM collections WHERE collection = ? AND owner_id = ?",
            (collection, owner_id),
        ).fetchone()
        if row is not None:
            self._conn.execute(f"DROP TABLE IF EXISTS {row[0]}")
        cursor = self._conn.execute(
            "DELETE FROM documents_meta WHERE collection = ? AND owner_id = ?",
            (collection, owner_id),
        )
        self._conn.commit()
        return cursor.rowcount > 0

    async def purge_owner(self, owner_id: OwnerId) -> int:
        async with self._lock:
            return await asyncio.to_thread(self._sync_purge_owner, owner_id)

    def _sync_purge_owner(self, owner_id: OwnerId) -> int:
        # Drop all vec0 virtual tables for this owner first (FK cascade can't reach them).
        vec_tables = [
            r[0]
            for r in self._conn.execute("SELECT table_name FROM collections WHERE owner_id = ?", (owner_id,)).fetchall()
        ]
        for name in vec_tables:
            self._conn.execute(f"DROP TABLE IF EXISTS {name}")
        cursor = self._conn.execute("DELETE FROM documents_meta WHERE owner_id = ?", (owner_id,))
        self._conn.commit()
        return cursor.rowcount

    async def reap_expired(self) -> int:
        async with self._lock:
            return await asyncio.to_thread(self._sync_reap_expired)

    def _sync_reap_expired(self) -> int:
        # Drop vec0 virtual tables for expired collections first (FK cascade can't reach them).
        vec_tables = [
            r[0]
            for r in self._conn.execute(
                """
                SELECT c.table_name FROM collections c
                JOIN documents_meta m
                  ON m.collection = c.collection AND m.owner_id = c.owner_id
                WHERE m.expires_at IS NOT NULL AND m.expires_at < datetime('now')
                """
            ).fetchall()
        ]
        for name in vec_tables:
            self._conn.execute(f"DROP TABLE IF EXISTS {name}")
        cursor = self._conn.execute(
            "DELETE FROM documents_meta WHERE expires_at IS NOT NULL AND expires_at < datetime('now')"
        )
        self._conn.commit()
        return cursor.rowcount

    # ── write paths ────────────────────────────────────────────────────────

    @staticmethod
    def _sanitize_table_name(collection: str, owner_id: OwnerId) -> str:
        safe_col = re.sub(r"[^a-zA-Z0-9_]", "_", collection)
        safe_owner = re.sub(r"[^a-zA-Z0-9_]", "_", owner_id)
        return f"vec_{safe_owner}_{safe_col}"

    @staticmethod
    def _normalize(vector: list[float]) -> list[float]:
        norm = math.sqrt(sum(x * x for x in vector))
        if norm == 0:
            return list(vector)
        return [x / norm for x in vector]

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

        async with self._lock:
            await asyncio.to_thread(self._sync_add, collection, documents, embeddings, owner_id)

    def _sync_add(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
        owner_id: OwnerId,
    ) -> None:
        dim = len(embeddings[0])
        row = self._conn.execute(
            "SELECT dim, table_name FROM collections WHERE collection = ? AND owner_id = ?",
            (collection, owner_id),
        ).fetchone()
        if row is None:
            table_name = self._sanitize_table_name(collection, owner_id)
            self._conn.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS {table_name} USING vec0(embedding float[{dim}])")
            self._conn.execute(
                "INSERT INTO collections(collection, owner_id, dim, table_name) VALUES (?, ?, ?, ?)",
                (collection, owner_id, dim, table_name),
            )
        else:
            existing_dim, table_name = row
            if existing_dim != dim:
                raise ValueError(
                    f"Collection {collection} for owner {owner_id} has dim {existing_dim}, got embedding of dim {dim}"
                )

        # Upsert: delete existing docs with matching IDs first
        ids = [doc.id for doc in documents]
        placeholders = ",".join("?" * len(ids))
        existing = self._conn.execute(
            f"SELECT vec_rowid FROM documents WHERE collection = ? AND owner_id = ? AND id IN ({placeholders})",
            (collection, owner_id, *ids),
        ).fetchall()
        if existing:
            vec_rowids = [r[0] for r in existing]
            row_placeholders = ",".join("?" * len(vec_rowids))
            self._conn.execute(
                f"DELETE FROM {table_name} WHERE rowid IN ({row_placeholders})",
                vec_rowids,
            )
            self._conn.execute(
                f"DELETE FROM documents WHERE collection = ? AND owner_id = ? AND id IN ({placeholders})",
                (collection, owner_id, *ids),
            )

        for doc, emb in zip(documents, embeddings):
            normalized = self._normalize(list(emb))
            cursor = self._conn.execute(
                f"INSERT INTO {table_name}(embedding) VALUES (?)",
                (sqlite_vec.serialize_float32(normalized),),
            )
            vec_rowid = cursor.lastrowid
            self._conn.execute(
                "INSERT INTO documents(id, collection, owner_id, text, metadata, vec_rowid) VALUES (?, ?, ?, ?, ?, ?)",
                (doc.id, collection, owner_id, doc.text, json.dumps(doc.metadata), vec_rowid),
            )
        self._conn.commit()

    async def add_pages(self, collection: str, pages: list[StoredPage], owner_id: OwnerId) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_add_pages, collection, pages, owner_id)

    def _sync_add_pages(self, collection: str, pages: list[StoredPage], owner_id: OwnerId) -> None:
        self._conn.execute(
            "DELETE FROM document_pages WHERE collection = ? AND owner_id = ?",
            (collection, owner_id),
        )
        if pages:
            self._conn.executemany(
                "INSERT INTO document_pages(collection, owner_id, page_number, text, char_count) "
                "VALUES (?, ?, ?, ?, ?)",
                [(collection, owner_id, p.page_number, p.text, p.char_count) for p in pages],
            )
        self._conn.commit()

    # ── ACL management ─────────────────────────────────────────────────────

    async def grant_read(
        self,
        collection: str,
        owner_id: OwnerId,
        principals: list[PrincipalId],
    ) -> None:
        if not principals:
            return
        async with self._lock:
            await asyncio.to_thread(self._sync_grant_read, collection, owner_id, principals)

    def _sync_grant_read(
        self,
        collection: str,
        owner_id: OwnerId,
        principals: list[PrincipalId],
    ) -> None:
        self._conn.executemany(
            """
            INSERT INTO document_acl(collection, owner_id, principal_id, permission)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(collection, owner_id, principal_id, permission) DO NOTHING
            """,
            [(collection, owner_id, p, _READ_PERMISSION) for p in principals],
        )
        self._conn.commit()

    async def revoke(
        self,
        collection: str,
        owner_id: OwnerId,
        principal: PrincipalId,
    ) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_revoke, collection, owner_id, principal)

    def _sync_revoke(self, collection: str, owner_id: OwnerId, principal: PrincipalId) -> None:
        self._conn.execute(
            "DELETE FROM document_acl WHERE collection = ? AND owner_id = ? AND principal_id = ?",
            (collection, owner_id, principal),
        )
        self._conn.commit()

    # ── read paths (ACL-gated) ─────────────────────────────────────────────

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
        principals: list[PrincipalId],
    ) -> list[SearchResult]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_search, collection, query_embedding, top_k, principals)

    def _sync_search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
        principals: list[PrincipalId],
    ) -> list[SearchResult]:
        if not principals:
            return []
        owner_id = self._readable_owner_for(collection, principals)
        if owner_id is None:
            return []
        row = self._conn.execute(
            "SELECT table_name, dim FROM collections WHERE collection = ? AND owner_id = ?",
            (collection, owner_id),
        ).fetchone()
        if row is None:
            return []
        table_name, dim = row
        if len(query_embedding) != dim:
            raise ValueError(f"Query embedding dim {len(query_embedding)} does not match collection dim {dim}")

        normalized = self._normalize(list(query_embedding))
        query_blob = sqlite_vec.serialize_float32(normalized)

        results = self._conn.execute(
            f"""
            SELECT d.id, d.text, d.metadata, v.distance
            FROM {table_name} v
            JOIN documents d
              ON d.vec_rowid = v.rowid
             AND d.collection = ?
             AND d.owner_id = ?
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
            """,
            (collection, owner_id, query_blob, top_k),
        ).fetchall()

        return [
            SearchResult(
                document=Document(
                    id=r[0],
                    text=r[1],
                    metadata=json.loads(r[2]) if r[2] else {},
                ),
                # For normalized vectors: cosine_sim = 1 - (L2^2 / 2)
                score=max(0.0, 1.0 - (r[3] ** 2) / 2.0),
            )
            for r in results
        ]

    def _readable_owner_for(self, collection: str, principals: list[PrincipalId]) -> str | None:
        """Resolve which owner_id this caller is reading. ``None`` means no access."""
        placeholders = ",".join("?" * len(principals))
        row = self._conn.execute(
            f"""
            SELECT owner_id FROM document_acl
            WHERE collection = ?
              AND permission = ?
              AND principal_id IN ({placeholders})
            ORDER BY owner_id
            LIMIT 1
            """,
            (collection, _READ_PERMISSION, *principals),
        ).fetchone()
        return row[0] if row else None

    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
        principals: list[PrincipalId],
    ) -> list[Page]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_read_pages, collection, page_range, principals)

    def _sync_read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
        principals: list[PrincipalId],
    ) -> list[Page]:
        if not principals:
            return []
        owner_id = self._readable_owner_for(collection, principals)
        if owner_id is None:
            return []
        if page_range is None:
            rows = self._conn.execute(
                "SELECT page_number, text, char_count FROM document_pages "
                "WHERE collection = ? AND owner_id = ? ORDER BY page_number",
                (collection, owner_id),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT page_number, text, char_count FROM document_pages "
                "WHERE collection = ? AND owner_id = ? AND page_number BETWEEN ? AND ? "
                "ORDER BY page_number",
                (collection, owner_id, page_range.start, page_range.end),
            ).fetchall()
        return [Page(page_number=r[0], text=r[1], char_count=r[2]) for r in rows]

    async def has_collection(self, collection: str, principals: list[PrincipalId]) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._sync_has_collection, collection, principals)

    def _sync_has_collection(self, collection: str, principals: list[PrincipalId]) -> bool:
        if not principals:
            return False
        return self._readable_owner_for(collection, principals) is not None

    async def list_collections(self, principals: list[PrincipalId]) -> list[str]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_list_collections, principals)

    def _sync_list_collections(self, principals: list[PrincipalId]) -> list[str]:
        if not principals:
            return []
        placeholders = ",".join("?" * len(principals))
        rows = self._conn.execute(
            f"""
            SELECT DISTINCT collection FROM document_acl
            WHERE permission = ?
              AND principal_id IN ({placeholders})
            ORDER BY collection
            """,
            (_READ_PERMISSION, *principals),
        ).fetchall()
        return [r[0] for r in rows]

    async def close(self) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_close)

    def _sync_close(self) -> None:
        """Checkpoint the WAL into the main database file and close the connection so
        the .db-shm and .db-wal files are cleaned up on graceful shutdown."""
        if self._db_path is not None:
            try:
                self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                self._conn.commit()
            except sqlite3.Error:
                # Best effort: if checkpointing fails we still want to close the connection.
                pass
        self._conn.close()
