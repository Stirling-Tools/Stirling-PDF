from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_service
from stirling.contracts.documents import PageText
from stirling.documents import DocumentService, SqliteVecStore
from stirling.models import FileId, OwnerId, PrincipalId

HEADERS = {"X-User-Id": "test-user"}


def block(
    markdown: str,
    page: int = 1,
    page_end: int | None = None,
    headings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "markdown": markdown,
        "pageStart": page,
        "pageEnd": page_end if page_end is not None else page,
        "headingPath": headings or [],
    }


class StubDocumentService:
    """Records ingest_prepared calls so the route's passthrough can be asserted."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.embedder = StubEmbedder()

    async def ingest_prepared(
        self,
        collection: FileId,
        chunks: list[tuple[str, dict[str, str]]],
        source: str,
        owner_id: OwnerId,
        read_principals: list[PrincipalId],
        expires_at: datetime | None,
        pages: list[PageText] | None = None,
    ) -> int:
        self.calls.append(
            {
                "collection": collection,
                "chunks": chunks,
                "source": source,
                "owner_id": owner_id,
                "read_principals": read_principals,
                "expires_at": expires_at,
                "pages": pages,
            }
        )
        return len(chunks)


class StubEmbedder:
    """Deterministic embeddings: no network, no provider needed."""

    def __init__(self, dim: int = 8) -> None:
        self._dim = dim
        self.configured = True

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


@pytest.mark.parametrize("configured", [True, False])
def test_capabilities_reports_live_embedding_readiness(
    client: TestClient, stub_service: StubDocumentService, configured: bool
) -> None:
    stub_service.embedder.configured = configured
    response = client.get("/api/v1/docparse/capabilities", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"indexingConfigured": configured}


def test_ingest_indexes_chunks_with_metadata(client: TestClient, stub_service: StubDocumentService) -> None:
    response = client.post(
        "/api/v1/docparse/ingest",
        json={
            "documentId": "doc-1",
            "blocks": [
                block("## Findings", headings=["Findings"]),
                block("para one", headings=["Findings"]),
                block("para two", page=2),
            ],
            "chunkSize": 64,
            "overlap": 0,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["documentId"] == "doc-1"
    assert body["chunksIndexed"] == 1
    assert body["chunks"] is None

    call = stub_service.calls[0]
    assert call["collection"] == "doc-1"
    assert call["source"] == "docparse"
    text, metadata = call["chunks"][0]
    assert text == "## Findings\n\npara one\n\npara two"
    assert metadata["content_type"] == "docparse_chunk"
    assert metadata["page_start"] == "1"
    assert metadata["page_end"] == "2"
    assert metadata["heading_path"] == "Findings"


def test_ingest_defaults_owner_and_readers_to_caller(client: TestClient, stub_service: StubDocumentService) -> None:
    client.post(
        "/api/v1/docparse/ingest",
        json={"documentId": "d", "blocks": [block("t")]},
        headers=HEADERS,
    )
    call = stub_service.calls[0]
    assert call["owner_id"] == "test-user"
    assert call["read_principals"] == ["test-user"]
    assert call["expires_at"] is None


def test_ingest_passes_explicit_owner_acl_and_expiry_through(
    client: TestClient, stub_service: StubDocumentService
) -> None:
    client.post(
        "/api/v1/docparse/ingest",
        json={
            "documentId": "d",
            "source": "handbook.pdf",
            "ownerId": "org:acme",
            "readPrincipals": ["group:eng", "user:bob"],
            "expiresAt": "2030-01-01T00:00:00Z",
            "blocks": [block("t")],
        },
        headers=HEADERS,
    )
    call = stub_service.calls[0]
    assert call["owner_id"] == "org:acme"
    assert call["read_principals"] == ["group:eng", "user:bob"]
    assert call["source"] == "handbook.pdf"
    assert call["expires_at"] is not None


def test_ingest_chunks_only_skips_the_store(client: TestClient, stub_service: StubDocumentService) -> None:
    response = client.post(
        "/api/v1/docparse/ingest",
        json={
            "documentId": "d",
            "blocks": [block("alpha"), block("beta", page=2)],
            "chunkSize": 64,
            "overlap": 0,
            "index": False,
            "includeChunks": True,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert stub_service.calls == []
    assert body["chunksIndexed"] == 0
    assert [c["text"] for c in body["chunks"]] == ["alpha\n\nbeta"]
    assert body["chunks"][0]["pageStart"] == 1
    assert body["chunks"][0]["pageEnd"] == 2


def test_ingest_index_off_with_no_export_is_422(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/ingest",
        json={"documentId": "d", "blocks": [block("t")], "index": False},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_without_blocks_is_422(client: TestClient) -> None:
    response = client.post("/api/v1/docparse/ingest", json={"documentId": "d"}, headers=HEADERS)
    assert response.status_code == 422


def test_ingest_rejects_missing_user_header(client: TestClient) -> None:
    response = client.post("/api/v1/docparse/ingest", json={"documentId": "d", "blocks": [block("t")]})
    assert response.status_code == 401


def test_ingest_rejects_empty_document_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/ingest",
        json={"documentId": "", "blocks": [block("t")]},
        headers=HEADERS,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_ingest_reingest_replaces_instead_of_duplicating() -> None:
    service = DocumentService(embedder=StubEmbedder(), store=SqliteVecStore.ephemeral(), default_top_k=3)  # type: ignore[arg-type]
    app.dependency_overrides[get_document_service] = lambda: service
    try:
        client = TestClient(app)
        payload: dict[str, Any] = {"documentId": "doc-replace", "blocks": [block("first version")]}
        assert client.post("/api/v1/docparse/ingest", json=payload, headers=HEADERS).status_code == 200
        payload["blocks"] = [block("second version")]
        assert client.post("/api/v1/docparse/ingest", json=payload, headers=HEADERS).status_code == 200
    finally:
        app.dependency_overrides.pop(get_document_service, None)

    results = await service.search("version", principals=[PrincipalId("test-user")], collection=FileId("doc-replace"))
    assert [r.document.text for r in results] == ["second version"]
    assert results[0].document.metadata["content_type"] == "docparse_chunk"
    assert results[0].document.metadata["source"] == "docparse"


def test_ingest_rejects_overlap_at_or_above_chunk_size(client: TestClient) -> None:
    """chunk_text derives its stride as chunk_size - overlap, so an overlap that meets or
    exceeds the chunk size either raises on a zero step or silently drops over-long text."""
    response = client.post(
        "/api/v1/docparse/ingest",
        json={
            "documentId": "doc-1",
            "blocks": [block("para one")],
            "chunkSize": 128,
            "overlap": 128,
        },
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert "overlap" in response.json()["detail"]


def test_ingest_forwards_pages_so_the_document_is_readable_whole(
    client: TestClient, stub_service: StubDocumentService
) -> None:
    """Chunks alone make a document searchable but not readable: read_pages backs the
    whole-document agents, so the page representation has to be written too."""
    client.post(
        "/api/v1/docparse/ingest",
        json={
            "documentId": "doc-1",
            "blocks": [
                block("page one para"),
                block("a table stitched over the break", page=2, page_end=3),
                block("page three para", page=3),
            ],
            "chunkSize": 128,
            "overlap": 0,
        },
        headers=HEADERS,
    )
    pages = stub_service.calls[0]["pages"]
    assert pages is not None
    # The stitched block belongs to page 2 alone, so page 3 carries only its own text.
    assert [(p.page_number, p.text) for p in pages] == [
        (1, "page one para"),
        (2, "a table stitched over the break"),
        (3, "page three para"),
    ]
