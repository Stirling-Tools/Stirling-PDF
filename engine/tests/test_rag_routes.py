from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_rag_service
from stirling.rag import Document, RagService, SqliteVecStore


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
def service() -> RagService:
    return _build_service()


@pytest.fixture
def client(service: RagService) -> Iterator[TestClient]:
    app.dependency_overrides[get_rag_service] = lambda: service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_rag_service, None)


# ── POST /documents ─────────────────────────────────────────────────────


def test_ingest_document_indexes_page_text(client: TestClient, service: RagService) -> None:
    response = client.post(
        "/api/v1/rag/documents",
        json={
            "documentId": "doc-123",
            "source": "report.pdf",
            "pageText": [
                {"pageNumber": 1, "text": "The introduction covers the main topic."},
                {"pageNumber": 2, "text": "The conclusion summarises the findings."},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["documentId"] == "doc-123"
    assert body["chunksIndexed"] >= 2


@pytest.mark.anyio
async def test_ingest_document_replaces_existing_content(client: TestClient, service: RagService) -> None:
    client.post(
        "/api/v1/rag/documents",
        json={
            "documentId": "replace-me",
            "pageText": [{"pageNumber": 1, "text": "Original content that existed before."}],
        },
    )
    # Second ingest with different content should replace the first entirely
    response = client.post(
        "/api/v1/rag/documents",
        json={
            "documentId": "replace-me",
            "pageText": [{"pageNumber": 1, "text": "New content that replaced the old."}],
        },
    )
    assert response.status_code == 200

    results = await service.search("New content", collection="replace-me", top_k=5)
    texts = [r.document.text for r in results]
    assert any("New content" in t for t in texts)
    assert not any("Original content" in t for t in texts)


def test_ingest_document_skips_empty_pages(client: TestClient) -> None:
    response = client.post(
        "/api/v1/rag/documents",
        json={
            "documentId": "mixed",
            "pageText": [
                {"pageNumber": 1, "text": "  "},
                {"pageNumber": 2, "text": "Real content on page 2."},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["chunksIndexed"] >= 1


def test_ingest_document_with_no_content_returns_zero(client: TestClient) -> None:
    response = client.post("/api/v1/rag/documents", json={"documentId": "empty"})
    assert response.status_code == 200
    assert response.json()["chunksIndexed"] == 0


def test_ingest_document_rejects_empty_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/rag/documents",
        json={"documentId": "", "pageText": [{"pageNumber": 1, "text": "something"}]},
    )
    assert response.status_code == 422


def test_ingest_document_rejects_non_positive_page_number(client: TestClient) -> None:
    response = client.post(
        "/api/v1/rag/documents",
        json={"documentId": "bad-page", "pageText": [{"pageNumber": 0, "text": "something"}]},
    )
    assert response.status_code == 422


# ── DELETE /documents/{id} ──────────────────────────────────────────────


def test_delete_document_reports_deleted_true_when_existed(client: TestClient) -> None:
    client.post(
        "/api/v1/rag/documents",
        json={"documentId": "to-delete", "pageText": [{"pageNumber": 1, "text": "Text."}]},
    )
    response = client.delete("/api/v1/rag/documents/to-delete")
    assert response.status_code == 200
    assert response.json() == {"documentId": "to-delete", "deleted": True}


def test_delete_document_is_idempotent(client: TestClient) -> None:
    response = client.delete("/api/v1/rag/documents/never-existed")
    assert response.status_code == 200
    assert response.json() == {"documentId": "never-existed", "deleted": False}


@pytest.mark.anyio
async def test_delete_document_removes_collection(client: TestClient, service: RagService) -> None:
    client.post(
        "/api/v1/rag/documents",
        json={"documentId": "gone", "pageText": [{"pageNumber": 1, "text": "Text."}]},
    )
    assert await service.has_collection("gone")
    client.delete("/api/v1/rag/documents/gone")
    assert not await service.has_collection("gone")
