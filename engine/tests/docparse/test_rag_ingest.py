from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_service
from stirling.documents import DocumentService, SqliteVecStore
from stirling.models import FileId, OwnerId, PrincipalId

HEADERS = {"X-User-Id": "test-user"}


class StubDocumentService:
    """Records ingest_prepared calls so the route's passthrough can be asserted."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def ingest_prepared(
        self,
        collection: FileId,
        chunks: list[tuple[str, dict[str, str]]],
        source: str,
        owner_id: OwnerId,
        read_principals: list[PrincipalId],
        expires_at: datetime | None,
    ) -> int:
        self.calls.append(
            {
                "collection": collection,
                "chunks": chunks,
                "source": source,
                "owner_id": owner_id,
                "read_principals": read_principals,
                "expires_at": expires_at,
            }
        )
        return len(chunks)


class StubEmbedder:
    """Deterministic embeddings: no network, no provider needed."""

    def __init__(self, dim: int = 8) -> None:
        self._dim = dim

    async def embed_query(self, text: str) -> list[float]:
        h = hash(text) % 1000
        return [(h + i) / 1000.0 for i in range(self._dim)]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_query(t) for t in texts]


@pytest.fixture
def stub_service() -> StubDocumentService:
    return StubDocumentService()


@pytest.fixture
def client(stub_service: StubDocumentService) -> Iterator[TestClient]:
    app.dependency_overrides[get_document_service] = lambda: stub_service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_document_service, None)


def test_rag_ingest_basic_tier_indexes_chunks_with_metadata(
    client: TestClient, stub_service: StubDocumentService
) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={
            "fileName": "report.pdf",
            "documentId": "doc-1",
            "pages": [{"pageNumber": 1, "text": "para one"}, {"pageNumber": 2, "text": "para two"}],
            "chunkSize": 64,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "basic"
    assert body["documentId"] == "doc-1"
    assert body["chunksIndexed"] == 2
    assert body["pages"] == 2
    assert body["markdown"] is None
    assert body["chunks"] is None

    call = stub_service.calls[0]
    assert call["collection"] == "doc-1"
    assert call["source"] == "docparse"
    text, metadata = call["chunks"][0]
    assert text == "para one"
    assert metadata["content_type"] == "docparse_chunk"
    assert metadata["page_start"] == "1"
    assert metadata["page_end"] == "1"


def test_rag_ingest_defaults_owner_and_readers_to_caller(client: TestClient, stub_service: StubDocumentService) -> None:
    client.post(
        "/api/v1/docparse/rag-ingest",
        json={"fileName": "a.pdf", "documentId": "d", "pages": [{"pageNumber": 1, "text": "t"}]},
        headers=HEADERS,
    )
    call = stub_service.calls[0]
    assert call["owner_id"] == "test-user"
    assert call["read_principals"] == ["test-user"]
    assert call["expires_at"] is None


def test_rag_ingest_passes_explicit_owner_acl_and_expiry_through(
    client: TestClient, stub_service: StubDocumentService
) -> None:
    client.post(
        "/api/v1/docparse/rag-ingest",
        json={
            "fileName": "a.pdf",
            "documentId": "d",
            "source": "handbook.pdf",
            "ownerId": "org:acme",
            "readPrincipals": ["group:eng", "user:bob"],
            "expiresAt": "2030-01-01T00:00:00Z",
            "pages": [{"pageNumber": 1, "text": "t"}],
        },
        headers=HEADERS,
    )
    call = stub_service.calls[0]
    assert call["owner_id"] == "org:acme"
    assert call["read_principals"] == ["group:eng", "user:bob"]
    assert call["source"] == "handbook.pdf"
    assert call["expires_at"] is not None


def test_rag_ingest_export_only_skips_the_store(client: TestClient, stub_service: StubDocumentService) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={
            "fileName": "a.pdf",
            "documentId": "d",
            "pages": [{"pageNumber": 1, "text": "alpha"}, {"pageNumber": 2, "text": "beta"}],
            "index": False,
            "includeMarkdown": True,
            "includeChunks": True,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert stub_service.calls == []
    assert body["chunksIndexed"] == 0
    assert body["markdown"] == "alpha\n\nbeta"
    assert [c["text"] for c in body["chunks"]] == ["alpha", "beta"]
    assert body["chunks"][0]["pageStart"] == 1


def test_rag_ingest_index_off_with_no_export_is_422(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={
            "fileName": "a.pdf",
            "documentId": "d",
            "pages": [{"pageNumber": 1, "text": "t"}],
            "index": False,
        },
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_rag_ingest_advanced_mode_needs_the_addon(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={
            "fileName": "x.pdf",
            "documentId": "d",
            "mode": "advanced",
            "pages": [{"pageNumber": 1, "text": "t"}],
        },
        headers=HEADERS,
    )
    assert response.status_code == 501
    assert response.json()["detail"]["addonRequired"] == "docparse"


def test_rag_ingest_without_pages_is_422(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest", json={"fileName": "x.pdf", "documentId": "d"}, headers=HEADERS
    )
    assert response.status_code == 422


def test_rag_ingest_rejects_missing_user_header(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={"fileName": "x.pdf", "documentId": "d", "pages": [{"pageNumber": 1, "text": "t"}]},
    )
    assert response.status_code == 401


def test_rag_ingest_rejects_empty_document_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/rag-ingest",
        json={"fileName": "x.pdf", "documentId": "", "pages": [{"pageNumber": 1, "text": "t"}]},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_capabilities_reports_probe_shape() -> None:
    # Not asserting a value: a dev venv may genuinely have docling installed.
    client = TestClient(app)
    response = client.get("/api/v1/docparse/capabilities", headers=HEADERS)
    assert response.status_code == 200
    assert isinstance(response.json()["advancedInstalled"], bool)


# ── real service: replacement semantics ─────────────────────────────────


@pytest.mark.anyio
async def test_rag_ingest_reingest_replaces_instead_of_duplicating() -> None:
    service = DocumentService(embedder=StubEmbedder(), store=SqliteVecStore.ephemeral(), default_top_k=3)  # type: ignore[arg-type]
    app.dependency_overrides[get_document_service] = lambda: service
    try:
        client = TestClient(app)
        payload = {
            "fileName": "report.pdf",
            "documentId": "doc-replace",
            "pages": [{"pageNumber": 1, "text": "first version"}],
        }
        assert client.post("/api/v1/docparse/rag-ingest", json=payload, headers=HEADERS).status_code == 200
        payload["pages"] = [{"pageNumber": 1, "text": "second version"}]
        assert client.post("/api/v1/docparse/rag-ingest", json=payload, headers=HEADERS).status_code == 200
    finally:
        app.dependency_overrides.pop(get_document_service, None)

    results = await service.search("version", principals=[PrincipalId("test-user")], collection=FileId("doc-replace"))
    assert [r.document.text for r in results] == ["second version"]
    assert results[0].document.metadata["content_type"] == "docparse_chunk"
    assert results[0].document.metadata["source"] == "docparse"
