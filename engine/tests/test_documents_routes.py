from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_service
from stirling.documents import Document, DocumentService, SqliteVecStore
from stirling.models import FileId, PrincipalId, UserId

USER = UserId("test-user")
USER_PRINCIPALS = [PrincipalId("test-user")]
HEADERS = {"X-User-Id": USER}


class StubEmbedder:
    """Deterministic embeddings for route tests: no network, no provider needed."""

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
        from stirling.documents.chunker import chunk_text

        chunks = chunk_text(text, 100, 10)
        docs = []
        for i, chunk in enumerate(chunks):
            meta = dict(base_metadata) if base_metadata else {}
            meta["source"] = source
            meta["chunk_index"] = str(i)
            doc_id = f"{source}:chunk:{i}" if source else f"chunk:{i}"
            docs.append(Document(id=doc_id, text=chunk, metadata=meta))
        return docs


def _build_service() -> DocumentService:
    return DocumentService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=3,
    )


@pytest.fixture
def service() -> DocumentService:
    return _build_service()


@pytest.fixture
def client(service: DocumentService) -> Iterator[TestClient]:
    app.dependency_overrides[get_document_service] = lambda: service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_document_service, None)


# ── POST /documents ─────────────────────────────────────────────────────


def test_ingest_document_indexes_page_text(client: TestClient, service: DocumentService) -> None:
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "doc-123",
            "source": "report.pdf",
            "pageText": [
                {"pageNumber": 1, "text": "The introduction covers the main topic."},
                {"pageNumber": 2, "text": "The conclusion summarises the findings."},
            ],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["documentId"] == "doc-123"
    assert body["chunksIndexed"] >= 2


@pytest.mark.anyio
async def test_ingest_document_replaces_existing_content(client: TestClient, service: DocumentService) -> None:
    client.post(
        "/api/v1/documents",
        json={
            "documentId": "replace-me",
            "source": "replace-me.pdf",
            "pageText": [{"pageNumber": 1, "text": "Original content that existed before."}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    # Second ingest with different content should replace the first entirely
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "replace-me",
            "source": "replace-me.pdf",
            "pageText": [{"pageNumber": 1, "text": "New content that replaced the old."}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200

    results = await service.search("New content", principals=USER_PRINCIPALS, collection=FileId("replace-me"), top_k=5)
    texts = [r.document.text for r in results]
    assert any("New content" in t for t in texts)
    assert not any("Original content" in t for t in texts)


def test_ingest_document_skips_empty_pages(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "mixed",
            "source": "mixed.pdf",
            "pageText": [
                {"pageNumber": 1, "text": "  "},
                {"pageNumber": 2, "text": "Real content on page 2."},
            ],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["chunksIndexed"] >= 1


def test_ingest_document_with_no_content_returns_zero(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "empty",
            "source": "empty.pdf",
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["chunksIndexed"] == 0


def test_ingest_document_rejects_empty_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={"documentId": "", "source": "x.pdf", "pageText": [{"pageNumber": 1, "text": "something"}]},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_missing_source(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={"documentId": "doc-1", "pageText": [{"pageNumber": 1, "text": "something"}]},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_empty_source(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={"documentId": "doc-1", "source": "", "pageText": [{"pageNumber": 1, "text": "something"}]},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_non_positive_page_number(client: TestClient) -> None:
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "bad-page",
            "source": "bad-page.pdf",
            "pageText": [{"pageNumber": 0, "text": "something"}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_missing_owner_id(client: TestClient) -> None:
    """ownerId is required — never derived from the caller. Forgetting it must 422,
    not silently fall back to personal-doc semantics."""
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "no-owner",
            "source": "no-owner.pdf",
            "pageText": [{"pageNumber": 1, "text": "something"}],
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_empty_read_principals(client: TestClient) -> None:
    """readPrincipals is required and must not be empty — every doc needs at least one reader."""
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "no-readers",
            "source": "no-readers.pdf",
            "pageText": [{"pageNumber": 1, "text": "something"}],
            "ownerId": USER,
            "readPrincipals": [],
        },
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_ingest_document_rejects_missing_user_header(client: TestClient) -> None:
    """The route must refuse to write per-user data when the caller didn't identify themselves."""
    response = client.post(
        "/api/v1/documents",
        json={
            "documentId": "doc-1",
            "source": "x.pdf",
            "pageText": [{"pageNumber": 1, "text": "something"}],
        },
    )
    assert response.status_code == 401


# ── DELETE /documents/{id} ──────────────────────────────────────────────


def test_delete_document_reports_deleted_true_when_existed(client: TestClient) -> None:
    client.post(
        "/api/v1/documents",
        json={
            "documentId": "to-delete",
            "source": "to-delete.pdf",
            "pageText": [{"pageNumber": 1, "text": "Text."}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    response = client.delete("/api/v1/documents/by-id/to-delete", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"documentId": "to-delete", "deleted": True}


def test_delete_document_is_idempotent(client: TestClient) -> None:
    response = client.delete("/api/v1/documents/by-id/never-existed", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"documentId": "never-existed", "deleted": False}


@pytest.mark.anyio
async def test_delete_document_removes_collection(client: TestClient, service: DocumentService) -> None:
    client.post(
        "/api/v1/documents",
        json={
            "documentId": "gone",
            "source": "gone.pdf",
            "pageText": [{"pageNumber": 1, "text": "Text."}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )
    assert await service.has_collection(FileId("gone"), principals=USER_PRINCIPALS)
    client.delete("/api/v1/documents/by-id/gone", headers=HEADERS)
    assert not await service.has_collection(FileId("gone"), principals=USER_PRINCIPALS)


def test_delete_document_rejects_missing_user_header(client: TestClient) -> None:
    response = client.delete("/api/v1/documents/by-id/anything")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_purge_by_owner_removes_only_callers_collections(client: TestClient, service: DocumentService) -> None:
    """Logout path: DELETE /api/v1/documents/by-owner purges only the caller's docs."""
    alice = {
        "documentId": "alice-doc",
        "source": "alice.pdf",
        "pageText": [{"pageNumber": 1, "text": "alice content"}],
        "ownerId": "alice",
        "readPrincipals": ["alice"],
        "expiresAt": None,
    }
    bob = {
        "documentId": "bob-doc",
        "source": "bob.pdf",
        "pageText": [{"pageNumber": 1, "text": "bob content"}],
        "ownerId": "bob",
        "readPrincipals": ["bob"],
        "expiresAt": None,
    }
    client.post("/api/v1/documents", json=alice, headers={"X-User-Id": "alice"})
    client.post("/api/v1/documents", json=bob, headers={"X-User-Id": "bob"})

    response = client.delete("/api/v1/documents/by-owner", headers={"X-User-Id": "alice"})
    assert response.status_code == 200
    assert response.json() == {"ownerId": "alice", "deleted": 1}

    # Alice gone, Bob still there.
    assert await service.has_collection(FileId("alice-doc"), principals=[PrincipalId("alice")]) is False
    assert await service.has_collection(FileId("bob-doc"), principals=[PrincipalId("bob")]) is True


def test_purge_by_owner_is_idempotent(client: TestClient) -> None:
    """Calling purge with no docs is fine — deleted=0 and no error."""
    response = client.delete("/api/v1/documents/by-owner", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"ownerId": USER, "deleted": 0}


def test_purge_by_owner_rejects_missing_user_header(client: TestClient) -> None:
    response = client.delete("/api/v1/documents/by-owner")
    assert response.status_code == 401


def test_delete_document_only_affects_calling_user(client: TestClient) -> None:
    """Two users with the same document id: one user's delete must not remove the other's."""
    alice_body = {
        "documentId": "shared",
        "source": "shared.pdf",
        "pageText": [{"pageNumber": 1, "text": "x"}],
        "ownerId": "alice",
        "readPrincipals": ["alice"],
        "expiresAt": None,
    }
    bob_body = {**alice_body, "ownerId": "bob", "readPrincipals": ["bob"], "expiresAt": None}
    client.post("/api/v1/documents", json=alice_body, headers={"X-User-Id": "alice"})
    client.post("/api/v1/documents", json=bob_body, headers={"X-User-Id": "bob"})

    alice_delete = client.delete("/api/v1/documents/by-id/shared", headers={"X-User-Id": "alice"})
    assert alice_delete.json() == {"documentId": "shared", "deleted": True}

    # Bob's copy is still there
    bob_delete = client.delete("/api/v1/documents/by-id/shared", headers={"X-User-Id": "bob"})
    assert bob_delete.json() == {"documentId": "shared", "deleted": True}
