from __future__ import annotations

from typing import Self

import pytest

from stirling.contracts.documents import PageRange
from stirling.documents.pgvector_store import PgVectorStore
from stirling.documents.store import Document, StoredPage
from stirling.models import OwnerId, PrincipalId

# Database tests use an in-memory async connection/pool double.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


class FakeCursor:
    def __init__(self, *, owner: str | None = "owner-1") -> None:
        self.rowcount = 2
        self.owner = owner
        self.rows: list[tuple[object, ...]] = [
            ("chunk-1", "text", {"source": "a"}, 0.9),
            (1, "page", 4),
        ]
        self.executed: list[tuple[str, object]] = []

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, params: object = ()) -> None:
        self.executed.append((query, params))

    async def executemany(self, query: str, params: object) -> None:
        self.executed.append((query, params))

    async def fetchone(self) -> tuple[str] | None:
        return (self.owner,) if self.owner else None

    async def fetchall(self) -> list[tuple[object, ...]]:
        query = self.executed[-1][0]
        if "SELECT id, text" in query:
            return [("chunk-1", "text", {"source": "a"}, 0.9)]
        if "page_number, text" in query:
            return [(1, "page", 4)]
        return [("docs",)]


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.cursor_value = cursor
        self.commits = 0

    def cursor(self) -> FakeCursor:
        return self.cursor_value

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1


class FakePool:
    def __init__(self, cursor: FakeCursor) -> None:
        self.connection_value = FakeConnection(cursor)
        self.closed = False

    def connection(self) -> FakeConnection:
        return self.connection_value

    async def close(self) -> None:
        self.closed = True


def store_with_cursor(cursor: FakeCursor | None = None) -> tuple[PgVectorStore, FakePool]:
    cursor = cursor or FakeCursor()
    pool = FakePool(cursor)
    store = object.__new__(PgVectorStore)
    store._initialized = True
    object.__setattr__(store, "_pool", pool)
    return store, pool


def test_pgvector_requires_dsn() -> None:
    with pytest.raises(ValueError, match="non-empty DSN"):
        PgVectorStore("", 1, 1)


@pytest.mark.anyio
async def test_pgvector_write_acl_and_lifecycle_paths() -> None:
    store, pool = store_with_cursor()

    owner = OwnerId("owner-1")
    await store.ensure_collection("docs", "source.pdf", owner, None)
    assert await store.purge_owner(owner) == 2
    assert await store.reap_expired() == 2
    assert await store.delete_collection("docs", owner) is True
    await store.add_documents("docs", [Document("id", "text", {"k": "v"})], [[0.1, 0.2]], owner)
    await store.add_pages("docs", [StoredPage(1, "page", 4)], owner)
    await store.grant_read("docs", owner, [PrincipalId("user-1"), PrincipalId("user-2")])
    await store.revoke("docs", owner, PrincipalId("user-1"))
    await store.close()

    assert pool.closed
    assert pool.connection_value.commits == 8


@pytest.mark.anyio
async def test_pgvector_acl_gated_reads_and_empty_inputs() -> None:
    store, _ = store_with_cursor()

    owner = OwnerId("owner-1")
    assert await store.add_documents("docs", [], [], owner) is None
    with pytest.raises(ValueError, match="documents"):
        await store.add_documents("docs", [Document("id", "text")], [], owner)
    assert await store.grant_read("docs", owner, []) is None
    assert await store.search("docs", [0.1], 5, []) == []
    assert await store.read_pages("docs", None, []) == []
    assert await store.has_collection("docs", []) is False
    assert await store.list_collections([]) == []

    principal = PrincipalId("user-1")
    assert (await store.search("docs", [0.1], 5, [principal]))[0].document.id == "chunk-1"
    assert (await store.read_pages("docs", PageRange(start=1, end=1), [principal]))[0].page_number == 1
    assert await store.has_collection("docs", [principal]) is True
    assert await store.list_collections([principal]) == ["docs"]


@pytest.mark.anyio
async def test_pgvector_denies_reads_without_acl_owner() -> None:
    store, _ = store_with_cursor(FakeCursor(owner=None))

    principal = PrincipalId("user-1")
    assert await store.search("docs", [0.1], 5, [principal]) == []
    assert await store.read_pages("docs", None, [principal]) == []
    assert await store.has_collection("docs", [principal]) is False


@pytest.mark.anyio
async def test_pgvector_bootstraps_schema_without_connecting_to_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor()
    connection = FakeConnection(cursor)

    async def connect(_dsn: str) -> FakeConnection:
        return connection

    monkeypatch.setattr("stirling.documents.pgvector_store.psycopg.AsyncConnection.connect", connect)
    store, _ = store_with_cursor(cursor)
    store._dsn = "postgresql://test"
    await store._bootstrap_schema()

    assert connection.commits == 1
    assert len(cursor.executed) >= 9
