from __future__ import annotations

import pytest

from stirling.contracts import PageText
from stirling.documents.chunker import chunk_text
from stirling.documents.rag_capability import RagCapability
from stirling.documents.service import DocumentService
from stirling.documents.sqlite_vec_store import SqliteVecStore
from stirling.documents.store import Document, SearchResult
from stirling.models import FileId, OwnerId, PrincipalId

# Personal-doc tests reuse the same opaque string in all three roles — keeps the
# defaults of ingest() exercised and tests honest about what the same id means
# (caller, tenant, single ACL grantee). Org-doc tests construct ad-hoc owners
# and principal sets inline.
OWNER = OwnerId("test-user")
OWNER_PRINCIPALS = [PrincipalId("test-user")]
OTHER_OWNER = OwnerId("other-user")
OTHER_OWNER_PRINCIPALS = [PrincipalId("other-user")]


# chunk_text


class TestChunkText:
    def test_empty_input_returns_empty(self) -> None:
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_short_text_returns_single_chunk(self) -> None:
        text = "Hello world."
        chunks = chunk_text(text, chunk_size=100)
        assert len(chunks) == 1
        assert chunks[0] == "Hello world."

    def test_splits_on_paragraph_boundaries(self) -> None:
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        chunks = chunk_text(text, chunk_size=30, overlap=0)
        assert len(chunks) >= 2
        assert "First paragraph." in chunks[0]

    def test_long_text_produces_multiple_chunks(self) -> None:
        text = " ".join(["word"] * 200)
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 200

    def test_overlap_produces_shared_content(self) -> None:
        sentences = [f"Sentence number {i}." for i in range(20)]
        text = " ".join(sentences)
        chunks = chunk_text(text, chunk_size=100, overlap=30)
        if len(chunks) >= 2:
            words_in_first_tail = chunks[0].split()[-3:]
            overlap_text = " ".join(words_in_first_tail)
            assert overlap_text in chunks[1], f"Expected overlap '{overlap_text}' in chunk[1]: '{chunks[1][:80]}...'"


# SqliteVecStore


class TestSqliteVecStore:
    """Each test gets its own ephemeral store to avoid cross-test dimension conflicts."""

    @pytest.mark.anyio
    async def test_add_and_search(self) -> None:
        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("test-col", "test.pdf", OWNER, None)
        await store.grant_read("test-col", OWNER, OWNER_PRINCIPALS)
        docs = [
            Document(id="1", text="Python is a programming language", metadata={"source": "test"}),
            Document(id="2", text="Java is another programming language", metadata={"source": "test"}),
            Document(id="3", text="The weather today is sunny", metadata={"source": "test"}),
        ]
        embeddings = [
            [1.0, 0.0, 0.0],
            [0.9, 0.1, 0.0],
            [0.0, 0.0, 1.0],
        ]
        await store.add_documents("test-col", docs, embeddings, OWNER)

        results = await store.search("test-col", [1.0, 0.05, 0.0], top_k=2, principals=OWNER_PRINCIPALS)
        assert len(results) == 2
        assert isinstance(results[0], SearchResult)
        assert results[0].document.id == "1"
        assert results[0].score > 0.5

    @pytest.mark.anyio
    async def test_list_and_has_collection(self) -> None:
        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("my-collection", "test.pdf", OWNER, None)
        await store.grant_read("my-collection", OWNER, OWNER_PRINCIPALS)
        docs = [Document(id="1", text="test", metadata={})]
        await store.add_documents("my-collection", docs, [[1.0, 0.0]], OWNER)

        collections = await store.list_collections(OWNER_PRINCIPALS)
        assert "my-collection" in collections
        assert await store.has_collection("my-collection", OWNER_PRINCIPALS) is True
        assert await store.has_collection("nonexistent", OWNER_PRINCIPALS) is False

    @pytest.mark.anyio
    async def test_delete_collection(self) -> None:
        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("to-delete", "test.pdf", OWNER, None)
        await store.grant_read("to-delete", OWNER, OWNER_PRINCIPALS)
        docs = [Document(id="1", text="test", metadata={})]
        await store.add_documents("to-delete", docs, [[1.0]], OWNER)

        assert await store.has_collection("to-delete", OWNER_PRINCIPALS) is True
        await store.delete_collection("to-delete", OWNER)
        assert await store.has_collection("to-delete", OWNER_PRINCIPALS) is False

    @pytest.mark.anyio
    async def test_search_empty_collection(self) -> None:
        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("empty-test", "test.pdf", OWNER, None)
        await store.grant_read("empty-test", OWNER, OWNER_PRINCIPALS)
        docs = [Document(id="1", text="test", metadata={})]
        await store.add_documents("empty-test", docs, [[1.0, 0.0]], OWNER)
        results = await store.search("empty-test", [1.0, 0.0], top_k=5, principals=OWNER_PRINCIPALS)
        assert len(results) == 1

    @pytest.mark.anyio
    async def test_mismatched_docs_embeddings_raises(self) -> None:
        store = SqliteVecStore.ephemeral()
        docs = [Document(id="1", text="test", metadata={})]
        with pytest.raises(ValueError, match="documents.*embeddings"):
            await store.add_documents("bad", docs, [[1.0], [2.0]], OWNER)

    @pytest.mark.anyio
    async def test_collections_isolated_by_owner(self) -> None:
        """Two owners can store the same collection id; reads stay scoped to ACL."""
        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("shared-id", "alice.pdf", OWNER, None)
        await store.grant_read("shared-id", OWNER, OWNER_PRINCIPALS)
        await store.ensure_collection("shared-id", "bob.pdf", OTHER_OWNER, None)
        await store.grant_read("shared-id", OTHER_OWNER, OTHER_OWNER_PRINCIPALS)
        await store.add_documents(
            "shared-id",
            [Document(id="1", text="alice content", metadata={})],
            [[1.0, 0.0]],
            OWNER,
        )
        await store.add_documents(
            "shared-id",
            [Document(id="1", text="bob content", metadata={})],
            [[1.0, 0.0]],
            OTHER_OWNER,
        )

        alice_results = await store.search("shared-id", [1.0, 0.0], top_k=5, principals=OWNER_PRINCIPALS)
        bob_results = await store.search("shared-id", [1.0, 0.0], top_k=5, principals=OTHER_OWNER_PRINCIPALS)
        assert [r.document.text for r in alice_results] == ["alice content"]
        assert [r.document.text for r in bob_results] == ["bob content"]
        assert await store.list_collections(OWNER_PRINCIPALS) == ["shared-id"]
        assert await store.list_collections(OTHER_OWNER_PRINCIPALS) == ["shared-id"]

        await store.delete_collection("shared-id", OWNER)
        assert await store.has_collection("shared-id", OWNER_PRINCIPALS) is False
        assert await store.has_collection("shared-id", OTHER_OWNER_PRINCIPALS) is True

    @pytest.mark.anyio
    async def test_purge_owner_removes_only_that_owners_collections(self) -> None:
        """Logout path: one owner's purge must not touch another owner's docs."""
        store = SqliteVecStore.ephemeral()
        for owner, principals, name in (
            (OWNER, OWNER_PRINCIPALS, "a.pdf"),
            (OWNER, OWNER_PRINCIPALS, "b.pdf"),
            (OTHER_OWNER, OTHER_OWNER_PRINCIPALS, "c.pdf"),
        ):
            await store.ensure_collection(name, name, owner, None)
            await store.grant_read(name, owner, principals)
            await store.add_documents(name, [Document(id="1", text="x", metadata={})], [[1.0, 0.0]], owner)

        deleted = await store.purge_owner(OWNER)
        assert deleted == 2
        assert await store.list_collections(OWNER_PRINCIPALS) == []
        assert await store.list_collections(OTHER_OWNER_PRINCIPALS) == ["c.pdf"]

    @pytest.mark.anyio
    async def test_reap_expired_drops_collections_past_expires_at(self) -> None:
        """TTL backstop: rows with ``expires_at`` in the past go away on reap."""
        from datetime import UTC, datetime, timedelta

        store = SqliteVecStore.ephemeral()
        now = datetime.now(UTC)
        await store.ensure_collection("fresh", "fresh.pdf", OWNER, now + timedelta(hours=1))
        await store.grant_read("fresh", OWNER, OWNER_PRINCIPALS)
        await store.ensure_collection("stale", "stale.pdf", OWNER, now - timedelta(seconds=1))
        await store.grant_read("stale", OWNER, OWNER_PRINCIPALS)

        deleted = await store.reap_expired()
        assert deleted == 1
        assert await store.list_collections(OWNER_PRINCIPALS) == ["fresh"]

    @pytest.mark.anyio
    async def test_reap_expired_keeps_persistent_and_unexpired(self) -> None:
        """Rows with ``expires_at`` in the future stay. Rows with null
        ``expires_at`` (org docs) are persistent and never touched, regardless
        of age."""
        from datetime import UTC, datetime, timedelta

        store = SqliteVecStore.ephemeral()
        await store.ensure_collection("session", "s.pdf", OWNER, datetime.now(UTC) + timedelta(hours=1))
        await store.grant_read("session", OWNER, OWNER_PRINCIPALS)
        await store.ensure_collection("persistent", "p.pdf", OTHER_OWNER, None)
        await store.grant_read("persistent", OTHER_OWNER, OTHER_OWNER_PRINCIPALS)

        deleted = await store.reap_expired()
        assert deleted == 0
        assert await store.list_collections(OWNER_PRINCIPALS) == ["session"]
        assert await store.list_collections(OTHER_OWNER_PRINCIPALS) == ["persistent"]

    @pytest.mark.anyio
    async def test_acl_grants_read_to_extra_principal(self) -> None:
        """A principal without an ACL row can't read; once granted, they can."""
        store = SqliteVecStore.ephemeral()
        team_principal = PrincipalId("group:engineering")
        await store.ensure_collection("doc", "engineering-runbook.pdf", OWNER, None)
        await store.grant_read("doc", OWNER, OWNER_PRINCIPALS)
        await store.add_documents(
            "doc",
            [Document(id="1", text="how to deploy", metadata={})],
            [[1.0, 0.0]],
            OWNER,
        )

        # Engineering can't see it yet.
        assert await store.has_collection("doc", [team_principal]) is False

        # Owner grants engineering read access.
        await store.grant_read("doc", OWNER, [team_principal])
        assert await store.has_collection("doc", [team_principal]) is True

        # Revoke kills it.
        await store.revoke("doc", OWNER, team_principal)
        assert await store.has_collection("doc", [team_principal]) is False
        # Owner still can.
        assert await store.has_collection("doc", OWNER_PRINCIPALS) is True


# DocumentService (with stub embedder)


class StubEmbeddingService:
    """A minimal stub that returns fixed-dimension embeddings for testing."""

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
        chunks = chunk_text(text, 100, 10)
        docs = []
        for i, chunk in enumerate(chunks):
            meta = dict(base_metadata) if base_metadata else {}
            meta["source"] = source
            meta["chunk_index"] = str(i)
            doc_id = f"{source}:chunk:{i}" if source else f"chunk:{i}"
            docs.append(Document(id=doc_id, text=chunk, metadata=meta))
        return docs


@pytest.fixture
def documents() -> DocumentService:
    """Each DocumentService test gets its own fresh ephemeral store to avoid dimension conflicts."""
    store = SqliteVecStore.ephemeral()
    return DocumentService(embedder=StubEmbeddingService(), store=store, default_top_k=3)  # type: ignore[arg-type]


def _pages(text: str) -> list[PageText]:
    return [PageText(page_number=1, text=text)]


class TestDocumentService:
    @pytest.mark.anyio
    async def test_ingest_and_search(self, documents: DocumentService) -> None:
        text = "Python is great for data science. It has many libraries like pandas and numpy."
        count = await documents.ingest(
            FileId("docs"),
            _pages(text),
            source="guide.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        assert count > 0

        results = await documents.search("Python libraries", principals=OWNER_PRINCIPALS, collection=FileId("docs"))
        assert len(results) > 0
        assert results[0].document.text

    @pytest.mark.anyio
    async def test_ingest_empty_text_returns_zero_chunks(self, documents: DocumentService) -> None:
        count = await documents.ingest(
            FileId("docs"),
            _pages(""),
            source="empty.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        assert count == 0

    @pytest.mark.anyio
    async def test_search_nonexistent_collection_returns_empty(self, documents: DocumentService) -> None:
        results = await documents.search("anything", principals=OWNER_PRINCIPALS, collection=FileId("nonexistent"))
        assert results == []

    @pytest.mark.anyio
    async def test_search_all_collections_for_principal(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("col-a"),
            _pages("Machine learning overview."),
            source="ml.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        await documents.ingest(
            FileId("col-b"),
            _pages("Deep learning with neural networks."),
            source="dl.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        results = await documents.search("neural networks", principals=OWNER_PRINCIPALS)
        assert len(results) > 0

    @pytest.mark.anyio
    async def test_search_does_not_cross_owner_boundary(self, documents: DocumentService) -> None:
        """A search by one principal set never returns docs owned by an unrelated owner."""
        await documents.ingest(
            FileId("col-a"),
            _pages("Alice's private notes."),
            source="alice.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        await documents.ingest(
            FileId("col-b"),
            _pages("Bob's private notes."),
            source="bob.pdf",
            owner_id=OTHER_OWNER,
            read_principals=OTHER_OWNER_PRINCIPALS,
            expires_at=None,
        )

        alice_results = await documents.search("notes", principals=OWNER_PRINCIPALS)
        bob_results = await documents.search("notes", principals=OTHER_OWNER_PRINCIPALS)
        alice_texts = [r.document.text for r in alice_results]
        bob_texts = [r.document.text for r in bob_results]
        assert any("Alice" in t for t in alice_texts)
        assert not any("Bob" in t for t in alice_texts)
        assert any("Bob" in t for t in bob_texts)
        assert not any("Alice" in t for t in bob_texts)

    @pytest.mark.anyio
    async def test_org_doc_visible_only_to_granted_group(self, documents: DocumentService) -> None:
        """Org-owned doc with explicit ACL: only granted principals see it."""
        org_owner = OwnerId("org:acme")
        eng_group = PrincipalId("group:engineering")
        hr_group = PrincipalId("group:hr")

        await documents.ingest(
            FileId("runbook"),
            _pages("Production deploy steps."),
            source="runbook.pdf",
            owner_id=org_owner,
            read_principals=[eng_group],
            expires_at=None,
        )

        # Engineering can read.
        eng_results = await documents.search("deploy", principals=[eng_group])
        assert len(eng_results) > 0

        # HR cannot.
        hr_results = await documents.search("deploy", principals=[hr_group])
        assert hr_results == []

        # Caller with both memberships (or org-wide principal) still sees it via eng.
        multi_results = await documents.search("deploy", principals=[hr_group, eng_group])
        assert len(multi_results) > 0

    @pytest.mark.anyio
    async def test_delete_collection(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("temp"),
            _pages("Temporary data."),
            source="tmp.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        collections = await documents.list_collections(OWNER_PRINCIPALS)
        assert "temp" in collections

        await documents.delete_collection(FileId("temp"), owner_id=OWNER)
        collections = await documents.list_collections(OWNER_PRINCIPALS)
        assert "temp" not in collections

    @pytest.mark.anyio
    async def test_ingest_stores_pages_in_order(self, documents: DocumentService) -> None:
        pages = [
            PageText(page_number=1, text="First page text."),
            PageText(page_number=2, text="Second page text."),
            PageText(page_number=3, text="Third page text."),
        ]
        await documents.ingest(
            FileId("ordered"),
            pages,
            source="ordered.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        stored = await documents.read_pages(FileId("ordered"), principals=OWNER_PRINCIPALS)
        assert [p.page_number for p in stored] == [1, 2, 3]
        assert stored[0].text == "First page text."
        assert stored[0].char_count == len("First page text.")

    @pytest.mark.anyio
    async def test_read_pages_with_range(self, documents: DocumentService) -> None:
        from stirling.contracts import PageRange

        pages = [PageText(page_number=i, text=f"page {i}") for i in range(1, 6)]
        await documents.ingest(
            FileId("ranged"), pages, source="r.pdf", owner_id=OWNER, read_principals=OWNER_PRINCIPALS, expires_at=None
        )

        subset = await documents.read_pages(
            FileId("ranged"), principals=OWNER_PRINCIPALS, page_range=PageRange(start=2, end=4)
        )
        assert [p.page_number for p in subset] == [2, 3, 4]

    @pytest.mark.anyio
    async def test_ingest_replaces_previous_pages(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("doc"),
            [PageText(page_number=1, text="old"), PageText(page_number=2, text="old2")],
            source="v1.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        await documents.ingest(
            FileId("doc"),
            [PageText(page_number=1, text="new")],
            source="v2.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        stored = await documents.read_pages(FileId("doc"), principals=OWNER_PRINCIPALS)
        assert [p.page_number for p in stored] == [1]
        assert stored[0].text == "new"

    @pytest.mark.anyio
    async def test_ingest_keeps_blank_pages_in_page_store(self, documents: DocumentService) -> None:
        """Blank pages are skipped for embedding but retained in the page store
        so page numbering stays continuous when reading back."""
        pages = [
            PageText(page_number=1, text="Real text on page 1."),
            PageText(page_number=2, text="   "),
            PageText(page_number=3, text="Real text on page 3."),
        ]
        await documents.ingest(
            FileId("with-blanks"),
            pages,
            source="blanks.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        stored = await documents.read_pages(FileId("with-blanks"), principals=OWNER_PRINCIPALS)
        assert [p.page_number for p in stored] == [1, 2, 3]
        assert stored[1].text.strip() == ""


# RagCapability


async def _invoke_search_knowledge(capability: RagCapability, query: str, max_results: int = 5) -> str:
    """Extract and call the search_knowledge tool function from a RagCapability's toolset."""
    from pydantic_ai import FunctionToolset

    toolset = capability.toolset
    assert isinstance(toolset, FunctionToolset)
    tool = toolset.tools["search_knowledge"]
    return await tool.function(query=query, max_results=max_results)  # type: ignore[call-arg]


class TestRagCapability:
    def test_instructions_static_when_collections_pinned(self, documents: DocumentService) -> None:
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS, collections=[FileId("docs"), FileId("manuals")])
        instructions = cap.instructions
        assert isinstance(instructions, str)
        assert "docs, manuals" in instructions
        assert "search_knowledge" in instructions

    def test_instructions_dynamic_when_no_collections(self, documents: DocumentService) -> None:
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        instructions = cap.instructions
        assert callable(instructions)

    @pytest.mark.anyio
    async def test_dynamic_instructions_list_available_collections(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("col-a"),
            _pages("Alpha content."),
            source="a.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        await documents.ingest(
            FileId("col-b"),
            _pages("Beta content."),
            source="b.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        instructions_fn = cap.instructions
        assert callable(instructions_fn)
        text = await instructions_fn()
        assert "col-a" in text
        assert "col-b" in text

    @pytest.mark.anyio
    async def test_dynamic_instructions_when_store_empty(self, documents: DocumentService) -> None:
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        instructions_fn = cap.instructions
        assert callable(instructions_fn)
        text = await instructions_fn()
        assert "empty" in text.lower()

    @pytest.mark.anyio
    async def test_search_knowledge_returns_no_results_message_when_empty(self, documents: DocumentService) -> None:
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        output = await _invoke_search_knowledge(cap, "anything")
        assert output == "No relevant results found in the knowledge base."

    @pytest.mark.anyio
    async def test_search_knowledge_formats_results_with_source_and_score(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("docs"),
            _pages("Python is a programming language."),
            source="guide.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        output = await _invoke_search_knowledge(cap, "Python")
        assert "[Result 1" in output
        assert "source: guide.pdf" in output
        assert "chunk:" in output
        assert "relevance:" in output

    @pytest.mark.anyio
    async def test_search_knowledge_restricts_to_pinned_collections(self, documents: DocumentService) -> None:
        await documents.ingest(
            FileId("pinned"),
            _pages("Pinned collection content."),
            source="pinned.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        await documents.ingest(
            FileId("other"),
            _pages("Content in another collection."),
            source="other.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        cap = RagCapability(documents, principals=OWNER_PRINCIPALS, collections=[FileId("pinned")])
        output = await _invoke_search_knowledge(cap, "content")
        assert "pinned.pdf" in output
        assert "other.pdf" not in output

    @pytest.mark.anyio
    async def test_search_knowledge_respects_max_results(self, documents: DocumentService) -> None:
        paragraphs = "\n\n".join(f"Paragraph {i} about topic." for i in range(10))
        await documents.ingest(
            FileId("bulk"),
            _pages(paragraphs),
            source="bulk.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )

        cap = RagCapability(documents, principals=OWNER_PRINCIPALS)
        output = await _invoke_search_knowledge(cap, "topic", max_results=2)
        assert "[Result 1" in output
        assert "[Result 2" in output
        assert "[Result 3" not in output

    @pytest.mark.anyio
    async def test_search_knowledge_tool_is_hidden_after_budget_exhausted(self, documents: DocumentService) -> None:
        """The prepare callback must return None once max_searches has been reached
        so the agent can no longer call the tool on subsequent turns."""
        await documents.ingest(
            FileId("docs"),
            _pages("Some content."),
            source="x.pdf",
            owner_id=OWNER,
            read_principals=OWNER_PRINCIPALS,
            expires_at=None,
        )
        cap = RagCapability(documents, principals=OWNER_PRINCIPALS, max_searches=2)
        tool_def = _dummy_tool_def()

        assert await cap._prepare_search_knowledge(None, tool_def) is tool_def  # type: ignore[arg-type]

        await _invoke_search_knowledge(cap, "content")
        await _invoke_search_knowledge(cap, "content")

        assert await cap._prepare_search_knowledge(None, tool_def) is None  # type: ignore[arg-type]


def _dummy_tool_def() -> object:
    """Sentinel passed to ``_prepare_search_knowledge``. The callback only inspects
    ``_search_count``; it doesn't read anything off the tool_def or context."""
    return object()
