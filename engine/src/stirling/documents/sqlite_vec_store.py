from __future__ import annotations

import asyncio
import json
import math
import re
import sqlite3
from pathlib import Path

import sqlite_vec

from stirling.contracts.documents import Page, PageRange
from stirling.documents.store import Document, DocumentStore, SearchResult, StoredPage


class SqliteVecStore(DocumentStore):
    """sqlite-vec backed vector store. Single-file SQLite database, embedded, no server.

    Each collection gets its own `vec0` virtual table with a fixed embedding dimension
    (detected on first insert). Document metadata lives in a regular table joined by rowid.
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
                collection TEXT PRIMARY KEY,
                source TEXT NOT NULL
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS collections (
                name TEXT PRIMARY KEY REFERENCES documents_meta(collection) ON DELETE CASCADE,
                dim INTEGER NOT NULL,
                table_name TEXT NOT NULL
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT NOT NULL,
                collection TEXT NOT NULL REFERENCES documents_meta(collection) ON DELETE CASCADE,
                text TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                vec_rowid INTEGER NOT NULL,
                PRIMARY KEY (id, collection)
            )
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_doc_collection ON documents(collection)")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_pages (
                collection TEXT NOT NULL REFERENCES documents_meta(collection) ON DELETE CASCADE,
                page_number INTEGER NOT NULL,
                text TEXT NOT NULL,
                char_count INTEGER NOT NULL,
                PRIMARY KEY (collection, page_number)
            )
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_pages_collection ON document_pages(collection)")
        self._conn.commit()

    async def ensure_collection(self, collection: str, source: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_ensure_collection, collection, source)

    def _sync_ensure_collection(self, collection: str, source: str) -> None:
        self._conn.execute(
            """
            INSERT INTO documents_meta(collection, source) VALUES (?, ?)
            ON CONFLICT(collection) DO UPDATE SET source = excluded.source
            """,
            (collection, source),
        )
        self._conn.commit()

    @staticmethod
    def _sanitize_table_name(collection: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", collection)
        return f"vec_{safe}"

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
    ) -> None:
        if len(documents) != len(embeddings):
            raise ValueError(f"Got {len(documents)} documents but {len(embeddings)} embeddings")
        if not documents:
            return

        async with self._lock:
            await asyncio.to_thread(self._sync_add, collection, documents, embeddings)

    def _sync_add(
        self,
        collection: str,
        documents: list[Document],
        embeddings: list[list[float]],
    ) -> None:
        dim = len(embeddings[0])
        row = self._conn.execute("SELECT dim, table_name FROM collections WHERE name = ?", (collection,)).fetchone()
        if row is None:
            table_name = self._sanitize_table_name(collection)
            self._conn.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS {table_name} USING vec0(embedding float[{dim}])")
            self._conn.execute(
                "INSERT INTO collections(name, dim, table_name) VALUES (?, ?, ?)",
                (collection, dim, table_name),
            )
        else:
            existing_dim, table_name = row
            if existing_dim != dim:
                raise ValueError(f"Collection {collection} has dim {existing_dim}, got embedding of dim {dim}")

        # Upsert: delete existing docs with matching IDs first
        ids = [doc.id for doc in documents]
        placeholders = ",".join("?" * len(ids))
        existing = self._conn.execute(
            f"SELECT vec_rowid FROM documents WHERE collection = ? AND id IN ({placeholders})",
            (collection, *ids),
        ).fetchall()
        if existing:
            vec_rowids = [r[0] for r in existing]
            row_placeholders = ",".join("?" * len(vec_rowids))
            self._conn.execute(
                f"DELETE FROM {table_name} WHERE rowid IN ({row_placeholders})",
                vec_rowids,
            )
            self._conn.execute(
                f"DELETE FROM documents WHERE collection = ? AND id IN ({placeholders})",
                (collection, *ids),
            )

        for doc, emb in zip(documents, embeddings):
            normalized = self._normalize(list(emb))
            cursor = self._conn.execute(
                f"INSERT INTO {table_name}(embedding) VALUES (?)",
                (sqlite_vec.serialize_float32(normalized),),
            )
            vec_rowid = cursor.lastrowid
            self._conn.execute(
                "INSERT INTO documents(id, collection, text, metadata, vec_rowid) VALUES (?, ?, ?, ?, ?)",
                (doc.id, collection, doc.text, json.dumps(doc.metadata), vec_rowid),
            )
        self._conn.commit()

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[SearchResult]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_search, collection, query_embedding, top_k)

    def _sync_search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int,
    ) -> list[SearchResult]:
        row = self._conn.execute("SELECT table_name, dim FROM collections WHERE name = ?", (collection,)).fetchone()
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
            JOIN documents d ON d.vec_rowid = v.rowid AND d.collection = ?
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
            """,
            (collection, query_blob, top_k),
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

    async def add_pages(self, collection: str, pages: list[StoredPage]) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_add_pages, collection, pages)

    def _sync_add_pages(self, collection: str, pages: list[StoredPage]) -> None:
        self._conn.execute("DELETE FROM document_pages WHERE collection = ?", (collection,))
        if pages:
            self._conn.executemany(
                "INSERT INTO document_pages(collection, page_number, text, char_count) VALUES (?, ?, ?, ?)",
                [(collection, p.page_number, p.text, p.char_count) for p in pages],
            )
        self._conn.commit()

    async def read_pages(
        self,
        collection: str,
        page_range: PageRange | None = None,
    ) -> list[Page]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_read_pages, collection, page_range)

    def _sync_read_pages(
        self,
        collection: str,
        page_range: PageRange | None,
    ) -> list[Page]:
        if page_range is None:
            rows = self._conn.execute(
                "SELECT page_number, text, char_count FROM document_pages WHERE collection = ? ORDER BY page_number",
                (collection,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT page_number, text, char_count FROM document_pages "
                "WHERE collection = ? AND page_number BETWEEN ? AND ? ORDER BY page_number",
                (collection, page_range.start, page_range.end),
            ).fetchall()
        return [Page(page_number=r[0], text=r[1], char_count=r[2]) for r in rows]

    async def delete_collection(self, collection: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_delete_collection, collection)

    def _sync_delete_collection(self, collection: str) -> None:
        # Drop the sqlite-vec virtual table first; FK cascade handles the regular tables
        # (collections, documents, document_pages) when documents_meta is deleted.
        row = self._conn.execute("SELECT table_name FROM collections WHERE name = ?", (collection,)).fetchone()
        if row is not None:
            self._conn.execute(f"DROP TABLE IF EXISTS {row[0]}")
        self._conn.execute("DELETE FROM documents_meta WHERE collection = ?", (collection,))
        self._conn.commit()

    async def list_collections(self) -> list[str]:
        async with self._lock:
            return await asyncio.to_thread(self._sync_list_collections)

    def _sync_list_collections(self) -> list[str]:
        rows = self._conn.execute("SELECT collection FROM documents_meta ORDER BY collection").fetchall()
        return [r[0] for r in rows]

    async def has_collection(self, collection: str) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._sync_has_collection, collection)

    def _sync_has_collection(self, collection: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM documents_meta WHERE collection = ?",
            (collection,),
        ).fetchone()
        return row is not None

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
