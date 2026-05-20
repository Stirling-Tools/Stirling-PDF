"""Tests for ``WholeDocReaderCapability``: tool dispatch, multi-file iteration,
budget enforcement, and graceful handling of missing pages.

The map-phase LLM call is patched at the reasoner boundary so tests don't hit
any model.
"""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.shared import ChunkedReasoner, ChunkNotes, WholeDocReaderCapability
from stirling.contracts import AiFile, PageText
from stirling.documents import Document, DocumentService, SqliteVecStore
from stirling.models import FileId
from stirling.services.runtime import AppRuntime


class StubEmbedder:
    """Deterministic embeddings so tests don't need a real provider."""

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
        docs: list[Document] = []
        for i, chunk in enumerate(chunks):
            meta = dict(base_metadata) if base_metadata else {}
            meta["source"] = source
            meta["chunk_index"] = str(i)
            doc_id = f"{source}:chunk:{i}" if source else f"chunk:{i}"
            docs.append(Document(id=doc_id, text=chunk, metadata=meta))
        return docs


@pytest.fixture
def runtime_with_stub_docs(runtime: AppRuntime) -> AppRuntime:
    stub = DocumentService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, documents=stub)


def _ai_file(file_id: str, name: str) -> AiFile:
    return AiFile(id=FileId(file_id), name=name)


@pytest.mark.anyio
async def test_read_full_document_returns_formatted_notes_for_single_file(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """The tool reads the file's stored pages, calls the reasoner's map phase,
    and returns the formatted notes prefixed by the file name."""
    pages = [
        PageText(page_number=1, text="Chapter one prose."),
        PageText(page_number=2, text="Chapter two prose."),
    ]
    await runtime_with_stub_docs.documents.ingest(FileId("doc-id"), pages, source="doc.pdf")

    reasoner = ChunkedReasoner(runtime_with_stub_docs)
    canned_notes = [ChunkNotes(pages=[1, 2], summary="overview", facts=["fact-A"])]
    with patch.object(reasoner, "gather_notes", AsyncMock(return_value=canned_notes)) as gather_mock:
        capability = WholeDocReaderCapability(
            runtime=runtime_with_stub_docs,
            files=[_ai_file("doc-id", "doc.pdf")],
            reasoner=reasoner,
        )
        result = await capability._read_full_document("what is in the document?")

    gather_mock.assert_awaited_once()
    call = gather_mock.await_args
    assert call is not None
    pages_arg = call.args[0]
    assert [p.page_number for p in pages_arg] == [1, 2]
    assert "=== doc.pdf ===" in result
    assert "fact-A" in result
    assert "[Notes from pages 1-2]" in result


@pytest.mark.anyio
async def test_read_full_document_iterates_multiple_files(runtime_with_stub_docs: AppRuntime) -> None:
    """Multi-file requests run the map phase per file and return one section
    per file in the formatted output."""
    for cid, source in (("doc-a", "a.pdf"), ("doc-b", "b.pdf")):
        await runtime_with_stub_docs.documents.ingest(
            FileId(cid),
            [PageText(page_number=1, text=f"contents of {cid}")],
            source=source,
        )

    reasoner = ChunkedReasoner(runtime_with_stub_docs)
    notes_by_call = [
        [ChunkNotes(pages=[1], summary="a-summary")],
        [ChunkNotes(pages=[1], summary="b-summary")],
    ]

    async def _gather(*_args: object, **_kwargs: object) -> list[ChunkNotes]:
        return notes_by_call.pop(0)

    with patch.object(reasoner, "gather_notes", AsyncMock(side_effect=_gather)) as gather_mock:
        capability = WholeDocReaderCapability(
            runtime=runtime_with_stub_docs,
            files=[_ai_file("doc-a", "a.pdf"), _ai_file("doc-b", "b.pdf")],
            reasoner=reasoner,
        )
        result = await capability._read_full_document("compare them")

    assert gather_mock.await_count == 2
    assert "=== a.pdf ===" in result
    assert "a-summary" in result
    assert "=== b.pdf ===" in result
    assert "b-summary" in result


@pytest.mark.anyio
async def test_read_full_document_skips_files_without_pages(runtime_with_stub_docs: AppRuntime) -> None:
    """Files with no stored pages are quietly skipped; the tool still runs
    the map phase for files that do have pages."""
    await runtime_with_stub_docs.documents.ingest(
        FileId("present"),
        [PageText(page_number=1, text="real content")],
        source="present.pdf",
    )
    # 'missing' is never ingested -> read_pages returns [].

    reasoner = ChunkedReasoner(runtime_with_stub_docs)
    canned = [ChunkNotes(pages=[1], summary="present summary")]
    with patch.object(reasoner, "gather_notes", AsyncMock(return_value=canned)) as gather_mock:
        capability = WholeDocReaderCapability(
            runtime=runtime_with_stub_docs,
            files=[_ai_file("missing", "missing.pdf"), _ai_file("present", "present.pdf")],
            reasoner=reasoner,
        )
        result = await capability._read_full_document("anything")

    gather_mock.assert_awaited_once()
    assert "=== present.pdf ===" in result
    assert "missing.pdf" not in result


@pytest.mark.anyio
async def test_read_full_document_returns_empty_message_when_no_pages_anywhere(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    reasoner = ChunkedReasoner(runtime_with_stub_docs)
    with patch.object(reasoner, "gather_notes", AsyncMock()) as gather_mock:
        capability = WholeDocReaderCapability(
            runtime=runtime_with_stub_docs,
            files=[_ai_file("nope", "nope.pdf")],
            reasoner=reasoner,
        )
        result = await capability._read_full_document("anything")

    gather_mock.assert_not_awaited()
    assert result == "Could not read any document content."


@pytest.mark.anyio
async def test_read_full_document_budget_hides_tool_when_exhausted(
    runtime_with_stub_docs: AppRuntime,
) -> None:
    """The prepare callback returns None once max_reads is reached so the
    agent can no longer call the tool on subsequent turns. Mirrors
    RagCapability's per-run budget."""
    await runtime_with_stub_docs.documents.ingest(
        FileId("doc-id"),
        [PageText(page_number=1, text="content")],
        source="doc.pdf",
    )
    reasoner = ChunkedReasoner(runtime_with_stub_docs)
    with patch.object(reasoner, "gather_notes", AsyncMock(return_value=[ChunkNotes(pages=[1], summary="s")])):
        capability = WholeDocReaderCapability(
            runtime=runtime_with_stub_docs,
            files=[_ai_file("doc-id", "doc.pdf")],
            reasoner=reasoner,
            max_reads=1,
        )
        sentinel: object = object()

        # Budget intact -> prepare returns the tool.
        assert await capability._prepare_read_full_document(None, sentinel) is sentinel  # type: ignore[arg-type]

        # Spend the budget.
        await capability._read_full_document("anything")

        # Budget spent -> prepare returns None.
        assert await capability._prepare_read_full_document(None, sentinel) is None  # type: ignore[arg-type]


@pytest.mark.anyio
async def test_instructions_mention_attached_files(runtime_with_stub_docs: AppRuntime) -> None:
    capability = WholeDocReaderCapability(
        runtime=runtime_with_stub_docs,
        files=[_ai_file("doc-a", "alpha.pdf"), _ai_file("doc-b", "beta.pdf")],
    )
    text = capability.instructions

    assert "alpha.pdf" in text
    assert "beta.pdf" in text
    assert "read_full_document" in text
