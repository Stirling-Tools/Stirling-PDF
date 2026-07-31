from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_service, get_knowledge_ask_agent
from stirling.contracts import AskDocumentsRequest, AskDocumentsResponse, DocumentPassage
from stirling.documents import Document, DocumentService, SqliteVecStore
from stirling.models import FileId, OwnerId, PrincipalId, UserId

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


# ── GET /documents/list ─────────────────────────────────────────────────


def _ingest(client: TestClient, document_id: str, source: str, texts: list[str], owner: str) -> None:
    client.post(
        "/api/v1/documents",
        json={
            "documentId": document_id,
            "source": source,
            "pageText": [{"pageNumber": i, "text": t} for i, t in enumerate(texts, 1)],
            "ownerId": owner,
            "readPrincipals": [owner],
            "expiresAt": None,
        },
        headers={"X-User-Id": owner},
    )


def test_list_documents_returns_caller_rollup(client: TestClient) -> None:
    _ingest(client, "list-a", "a.pdf", ["Page one text.", "Page two text."], USER)
    _ingest(client, "list-b", "b.pdf", ["Only page."], USER)

    response = client.get("/api/v1/documents/list", headers=HEADERS)
    assert response.status_code == 200
    documents = response.json()["documents"]
    assert [d["documentId"] for d in documents] == ["list-a", "list-b"]
    by_id = {d["documentId"]: d for d in documents}
    assert by_id["list-a"]["source"] == "a.pdf"
    assert by_id["list-a"]["chunks"] >= 2
    assert by_id["list-b"]["source"] == "b.pdf"
    assert by_id["list-b"]["chunks"] >= 1


def test_list_documents_empty_for_new_user(client: TestClient) -> None:
    response = client.get("/api/v1/documents/list", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"documents": []}


def test_list_documents_hides_other_users_documents(client: TestClient) -> None:
    """User A must never see user B's documents in the rollup."""
    _ingest(client, "alice-doc", "alice.pdf", ["alice content"], "alice")
    _ingest(client, "bob-doc", "bob.pdf", ["bob content"], "bob")

    alice_docs = client.get("/api/v1/documents/list", headers={"X-User-Id": "alice"}).json()["documents"]
    bob_docs = client.get("/api/v1/documents/list", headers={"X-User-Id": "bob"}).json()["documents"]
    assert [d["documentId"] for d in alice_docs] == ["alice-doc"]
    assert [d["documentId"] for d in bob_docs] == ["bob-doc"]


def test_list_documents_rejects_missing_user_header(client: TestClient) -> None:
    assert client.get("/api/v1/documents/list").status_code == 401


# ── POST /documents/search ──────────────────────────────────────────────


def test_search_documents_maps_page_text_chunks(client: TestClient) -> None:
    """Plain ingested chunks only carry page_number: both bounds map to it and
    the ":page:N" suffix is stripped off the source."""
    client.post(
        "/api/v1/documents",
        json={
            "documentId": "report",
            "source": "report.pdf",
            "pageText": [{"pageNumber": 3, "text": "The launch is planned for October."}],
            "ownerId": USER,
            "readPrincipals": [USER],
            "expiresAt": None,
        },
        headers=HEADERS,
    )

    response = client.post("/api/v1/documents/search", json={"query": "launch", "topK": 5}, headers=HEADERS)
    assert response.status_code == 200
    passages = response.json()["passages"]
    assert len(passages) >= 1
    passage = passages[0]
    assert passage["documentId"] == "report"
    assert passage["pageStart"] == 3
    assert passage["pageEnd"] == 3
    assert passage["headingPath"] == []
    assert passage["source"] == "report.pdf"
    assert "launch" in passage["text"]
    assert isinstance(passage["score"], float)


@pytest.mark.anyio
async def test_search_documents_maps_docparse_chunk_metadata(client: TestClient, service: DocumentService) -> None:
    """Docparse chunks carry page bounds + heading path; they map straight onto the wire."""
    await service.ingest_prepared(
        collection=FileId("dp-doc"),
        chunks=[
            (
                "Revenue grew 12% in Q2.",
                {
                    "content_type": "docparse_chunk",
                    "page_start": "2",
                    "page_end": "3",
                    "heading_path": "Report > Finance",
                },
            )
        ],
        source="q2.pdf",
        owner_id=OwnerId(USER),
        read_principals=USER_PRINCIPALS,
        expires_at=None,
    )

    response = client.post("/api/v1/documents/search", json={"query": "revenue"}, headers=HEADERS)
    assert response.status_code == 200
    passage = response.json()["passages"][0]
    assert passage["documentId"] == "dp-doc"
    assert passage["pageStart"] == 2
    assert passage["pageEnd"] == 3
    assert passage["headingPath"] == ["Report", "Finance"]
    assert passage["source"] == "q2.pdf"


def test_search_documents_cannot_see_other_users_documents(client: TestClient) -> None:
    """User B searching for user A's content must get nothing back."""
    _ingest(client, "alice-doc", "alice.pdf", ["The secret launch code is October."], "alice")

    bob = client.post("/api/v1/documents/search", json={"query": "secret launch"}, headers={"X-User-Id": "bob"})
    assert bob.status_code == 200
    assert bob.json()["passages"] == []

    alice = client.post("/api/v1/documents/search", json={"query": "secret launch"}, headers={"X-User-Id": "alice"})
    assert alice.json()["passages"] != []


def test_search_documents_rejects_empty_query(client: TestClient) -> None:
    response = client.post("/api/v1/documents/search", json={"query": ""}, headers=HEADERS)
    assert response.status_code == 422


def test_search_documents_rejects_top_k_above_cap(client: TestClient) -> None:
    response = client.post("/api/v1/documents/search", json={"query": "x", "topK": 51}, headers=HEADERS)
    assert response.status_code == 422


def test_search_documents_rejects_missing_user_header(client: TestClient) -> None:
    assert client.post("/api/v1/documents/search", json={"query": "x"}).status_code == 401


# ── POST /documents/ask ─────────────────────────────────────────────────


class StubKnowledgeAskAgent:
    """Stands in for KnowledgeAskAgent so route tests don't call a model."""

    def __init__(self, response: AskDocumentsResponse) -> None:
        self._response = response
        self.calls: list[tuple[AskDocumentsRequest, list[PrincipalId]]] = []

    async def ask(self, request: AskDocumentsRequest, principals: list[PrincipalId]) -> AskDocumentsResponse:
        self.calls.append((request, principals))
        return self._response


@pytest.fixture
def ask_agent() -> StubKnowledgeAskAgent:
    return StubKnowledgeAskAgent(
        AskDocumentsResponse(
            answer="Revenue grew 12% (q2.pdf p.2).",
            passages=[
                DocumentPassage(
                    document_id=FileId("dp-doc"),
                    text="Revenue grew 12% in Q2.",
                    score=0.91,
                    page_start=2,
                    page_end=3,
                    heading_path=["Report", "Finance"],
                    source="q2.pdf",
                )
            ],
        )
    )


@pytest.fixture
def ask_client(client: TestClient, ask_agent: StubKnowledgeAskAgent) -> Iterator[TestClient]:
    app.dependency_overrides[get_knowledge_ask_agent] = lambda: ask_agent
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_knowledge_ask_agent, None)


def test_ask_documents_returns_answer_and_passages(ask_client: TestClient) -> None:
    response = ask_client.post("/api/v1/documents/ask", json={"question": "How did revenue do?"}, headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "Revenue grew 12% (q2.pdf p.2)."
    assert body["passages"] == [
        {
            "documentId": "dp-doc",
            "text": "Revenue grew 12% in Q2.",
            "score": 0.91,
            "pageStart": 2,
            "pageEnd": 3,
            "headingPath": ["Report", "Finance"],
            "source": "q2.pdf",
        }
    ]


def test_ask_documents_scopes_to_calling_user(ask_client: TestClient, ask_agent: StubKnowledgeAskAgent) -> None:
    """The route hands the agent exactly the caller's principal set."""
    ask_client.post("/api/v1/documents/ask", json={"question": "anything"}, headers=HEADERS)
    request, principals = ask_agent.calls[0]
    assert principals == [PrincipalId(USER)]
    assert request.top_k == 8


def test_ask_documents_rejects_empty_question(ask_client: TestClient) -> None:
    response = ask_client.post("/api/v1/documents/ask", json={"question": ""}, headers=HEADERS)
    assert response.status_code == 422


def test_ask_documents_rejects_top_k_above_cap(ask_client: TestClient) -> None:
    response = ask_client.post("/api/v1/documents/ask", json={"question": "x", "topK": 21}, headers=HEADERS)
    assert response.status_code == 422


def test_ask_documents_rejects_missing_user_header(ask_client: TestClient) -> None:
    assert ask_client.post("/api/v1/documents/ask", json={"question": "x"}).status_code == 401


# ── GET /documents/stats ────────────────────────────────────────────────


def test_stats_on_empty_store_reports_zero(client: TestClient) -> None:
    response = client.get("/api/v1/documents/stats", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["documents"] == 0
    assert body["chunks"] == 0
    assert body["backend"] in ("sqlite", "pgvector")
    assert body["embeddingModel"]


def test_stats_counts_seeded_documents_across_owners(client: TestClient) -> None:
    """Stats are deployment-wide: both owners' content is counted."""
    for owner, doc in (("alice", "doc-a"), ("bob", "doc-b")):
        client.post(
            "/api/v1/documents",
            json={
                "documentId": doc,
                "source": f"{doc}.pdf",
                "pageText": [{"pageNumber": 1, "text": "Some content for the stats endpoint."}],
                "ownerId": owner,
                "readPrincipals": [owner],
                "expiresAt": None,
            },
            headers={"X-User-Id": owner},
        )
    response = client.get("/api/v1/documents/stats", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["documents"] == 2
    assert body["chunks"] >= 2


def test_stats_rejects_missing_user_header(client: TestClient) -> None:
    assert client.get("/api/v1/documents/stats").status_code == 401


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
