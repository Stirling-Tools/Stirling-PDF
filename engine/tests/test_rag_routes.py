from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_rag_embedding_model, get_rag_service
from stirling.rag.service import RagService
from stirling.rag.sqlite_vec_store import SqliteVecStore
from stirling.rag.store import Document

TEST_EMBEDDING_MODEL = "test-embedder"


class StubEmbedder:
    """Deterministic embeddings for route tests — no network, no provider needed."""

    def __init__(self, dim: int = 8) -> None:
        self._dim = dim

    async def embed_query(self, text: str) -> list[float]:
        h = hash(text) % 1000
        return [(h + i) / 1000.0 for i in range(self._dim)]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_query(t) for t in texts]

    def chunk_and_prepare(
        self,
        text: str,
        source: str = "",
        base_metadata: dict[str, str] | None = None,
    ) -> list[Document]:
        from stirling.rag.chunker import chunk_text

        chunks = chunk_text(text, 100, 10)
        docs = []
        for i, chunk in enumerate(chunks):
            meta = dict(base_metadata) if base_metadata else {}
            meta["source"] = source
            meta["chunk_index"] = str(i)
            doc_id = f"{source}:chunk:{i}" if source else f"chunk:{i}"
            docs.append(Document(id=doc_id, text=chunk, metadata=meta))
        return docs


def _build_service() -> RagService:
    return RagService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=3,
    )


@pytest.fixture
def enabled_client() -> Iterator[TestClient]:
    service = _build_service()
    app.dependency_overrides[get_rag_service] = lambda: service
    app.dependency_overrides[get_rag_embedding_model] = lambda: TEST_EMBEDDING_MODEL
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_rag_service, None)
        app.dependency_overrides.pop(get_rag_embedding_model, None)


@pytest.fixture
def disabled_client() -> Iterator[TestClient]:
    app.dependency_overrides[get_rag_service] = lambda: None
    app.dependency_overrides[get_rag_embedding_model] = lambda: ""
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_rag_service, None)
        app.dependency_overrides.pop(get_rag_embedding_model, None)


# ── /status ─────────────────────────────────────────────────────────────


def test_status_reports_disabled(disabled_client: TestClient) -> None:
    response = disabled_client.get("/api/v1/rag/status")
    assert response.status_code == 200
    body = response.json()
    assert body == {"enabled": False, "embedding_model": "", "collections": []}


def test_status_reports_enabled_with_collections(enabled_client: TestClient) -> None:
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "my-docs", "text": "Hello world.", "source": "a.pdf"},
    )
    response = enabled_client.get("/api/v1/rag/status")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["embedding_model"] == TEST_EMBEDDING_MODEL
    assert "my-docs" in body["collections"]


# ── /index ──────────────────────────────────────────────────────────────


def test_index_returns_chunk_count(enabled_client: TestClient) -> None:
    response = enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "indexed", "text": "Short text.", "source": "doc.pdf"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["collection"] == "indexed"
    assert body["chunks_indexed"] >= 1


def test_index_returns_503_when_rag_disabled(disabled_client: TestClient) -> None:
    response = disabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "disabled", "text": "Text.", "source": "x.pdf"},
    )
    assert response.status_code == 503


def test_index_rejects_invalid_collection_name(enabled_client: TestClient) -> None:
    response = enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "bad name!", "text": "Text.", "source": "x.pdf"},
    )
    assert response.status_code == 422


def test_index_rejects_oversized_text(enabled_client: TestClient) -> None:
    huge = "x" * 1_000_001  # Just over the 1MB cap
    response = enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "toobig", "text": huge},
    )
    assert response.status_code == 422


# ── /search ─────────────────────────────────────────────────────────────


def test_search_returns_results(enabled_client: TestClient) -> None:
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "search-test", "text": "Python is fun.", "source": "guide.pdf"},
    )
    response = enabled_client.post(
        "/api/v1/rag/search",
        json={"query": "Python", "collection": "search-test", "top_k": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "Python"
    assert len(body["results"]) >= 1
    first = body["results"][0]
    assert first["source"] == "guide.pdf"
    assert "score" in first


def test_search_returns_503_when_rag_disabled(disabled_client: TestClient) -> None:
    response = disabled_client.post(
        "/api/v1/rag/search",
        json={"query": "anything"},
    )
    assert response.status_code == 503


def test_search_rejects_invalid_collection_name(enabled_client: TestClient) -> None:
    response = enabled_client.post(
        "/api/v1/rag/search",
        json={"query": "anything", "collection": "bad--name"},
    )
    assert response.status_code == 422


def test_search_without_collection_searches_all(enabled_client: TestClient) -> None:
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "col-one", "text": "Alpha content.", "source": "one.pdf"},
    )
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "col-two", "text": "Beta content.", "source": "two.pdf"},
    )
    response = enabled_client.post(
        "/api/v1/rag/search",
        json={"query": "content"},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) >= 1


# ── /collections ────────────────────────────────────────────────────────


def test_collections_empty_when_rag_disabled(disabled_client: TestClient) -> None:
    response = disabled_client.get("/api/v1/rag/collections")
    assert response.status_code == 200
    assert response.json() == {"collections": []}


def test_collections_lists_indexed(enabled_client: TestClient) -> None:
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "list-me", "text": "Text.", "source": "x.pdf"},
    )
    response = enabled_client.get("/api/v1/rag/collections")
    assert response.status_code == 200
    assert "list-me" in response.json()["collections"]


# ── DELETE /collections/{name} ──────────────────────────────────────────


def test_delete_collection_removes_it(enabled_client: TestClient) -> None:
    enabled_client.post(
        "/api/v1/rag/index",
        json={"collection": "to-delete", "text": "Text.", "source": "x.pdf"},
    )
    response = enabled_client.delete("/api/v1/rag/collections/to-delete")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "collection": "to-delete"}

    listing = enabled_client.get("/api/v1/rag/collections").json()
    assert "to-delete" not in listing["collections"]


def test_delete_collection_returns_503_when_rag_disabled(disabled_client: TestClient) -> None:
    response = disabled_client.delete("/api/v1/rag/collections/anything")
    assert response.status_code == 503


def test_delete_collection_rejects_invalid_name(enabled_client: TestClient) -> None:
    response = enabled_client.delete("/api/v1/rag/collections/bad__name")
    assert response.status_code == 400
