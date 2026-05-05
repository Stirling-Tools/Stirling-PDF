from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents import PdfQuestionAgent
from stirling.contracts import (
    AiFile,
    ExtractedFileText,
    IngestedPageText,
    NeedIngestResponse,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionTerminalResponse,
    PdfTextSelection,
    SupportedCapability,
)
from stirling.documents import Document, DocumentService, SqliteVecStore
from stirling.models import FileId
from stirling.services.runtime import AppRuntime


class StubEmbedder:
    """Deterministic embeddings so RAG lookups work in tests without network."""

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


class StubPdfQuestionAgent(PdfQuestionAgent):
    def __init__(self, runtime: AppRuntime, response: PdfQuestionTerminalResponse) -> None:
        super().__init__(runtime)
        self._response = response

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionTerminalResponse:
        return self._response

    async def _needs_whole_doc(self, question: str) -> bool:
        # Pin the classifier off for the legacy RAG-path tests so they don't
        # accidentally route through ChunkedReasoner via the test model's
        # nondeterministic output.
        return False


@pytest.fixture
def runtime_with_stub_rag(runtime: AppRuntime) -> AppRuntime:
    """A runtime whose document service uses a stub embedder + ephemeral store."""
    stub = DocumentService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, documents=stub)


@pytest.mark.anyio
async def test_requests_ingest_when_file_missing_from_rag(runtime_with_stub_rag: AppRuntime) -> None:
    agent = PdfQuestionAgent(runtime_with_stub_rag)

    missing_file = AiFile(id=FileId("missing-id"), name="missing.pdf")
    response = await agent.handle(PdfQuestionRequest(question="What is the total?", files=[missing_file]))

    assert isinstance(response, NeedIngestResponse)
    assert response.resume_with == SupportedCapability.PDF_QUESTION
    assert response.files_to_ingest == [missing_file]
    assert PdfContentType.PAGE_TEXT in response.content_types


@pytest.mark.anyio
async def test_reports_only_missing_files(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.documents.ingest(
        FileId("present-id"),
        [IngestedPageText(page_number=1, text="Invoice total: 120.00.")],
        source="present.pdf",
    )
    agent = PdfQuestionAgent(runtime_with_stub_rag)

    present_file = AiFile(id=FileId("present-id"), name="present.pdf")
    missing_file = AiFile(id=FileId("missing-id"), name="missing.pdf")
    response = await agent.handle(PdfQuestionRequest(question="What is the total?", files=[present_file, missing_file]))

    assert isinstance(response, NeedIngestResponse)
    assert response.files_to_ingest == [missing_file]


@pytest.mark.anyio
async def test_returns_grounded_answer_when_all_files_ingested(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.documents.ingest(
        FileId("invoice-id"),
        [IngestedPageText(page_number=1, text="Invoice total: 120.00.")],
        source="invoice.pdf",
    )
    agent = StubPdfQuestionAgent(
        runtime_with_stub_rag,
        PdfQuestionAnswerResponse(
            answer="The invoice total is 120.00.",
            evidence=[
                ExtractedFileText(
                    file_name="invoice.pdf",
                    pages=[PdfTextSelection(page_number=1, text="Invoice total: 120.00")],
                )
            ],
        ),
    )

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            files=[AiFile(id=FileId("invoice-id"), name="invoice.pdf")],
        )
    )

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == "The invoice total is 120.00."


@pytest.mark.anyio
async def test_returns_not_found_when_answer_not_in_doc(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.documents.ingest(
        FileId("shipping-id"),
        [IngestedPageText(page_number=1, text="This page contains only a shipping address.")],
        source="shipping.pdf",
    )
    agent = StubPdfQuestionAgent(
        runtime_with_stub_rag,
        PdfQuestionNotFoundResponse(reason="The answer is not present in the text."),
    )

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            files=[AiFile(id=FileId("shipping-id"), name="shipping.pdf")],
        )
    )

    assert isinstance(response, PdfQuestionNotFoundResponse)


@pytest.mark.anyio
async def test_whole_doc_question_uses_chunked_reasoner(runtime_with_stub_rag: AppRuntime) -> None:
    """When the classifier flags whole-doc intent, the agent routes the request
    through ``ChunkedReasoner`` rather than the RAG-search path."""
    pages = [
        IngestedPageText(page_number=1, text="Page 1 prose."),
        IngestedPageText(page_number=2, text="Page 2 prose."),
    ]
    await runtime_with_stub_rag.documents.ingest(FileId("doc-id"), pages, source="doc.pdf")

    agent = PdfQuestionAgent(runtime_with_stub_rag)
    canned = PdfQuestionAnswerResponse(answer="overall summary", evidence=[])

    with (
        patch.object(agent, "_needs_whole_doc", AsyncMock(return_value=True)),
        patch.object(agent._chunked_reasoner, "reason", AsyncMock(return_value=canned)) as reason_mock,
        patch.object(agent, "_run_answer_agent", AsyncMock()) as rag_mock,
    ):
        response = await agent.handle(
            PdfQuestionRequest(
                question="summarise the document",
                files=[AiFile(id=FileId("doc-id"), name="doc.pdf")],
            )
        )

    assert response is canned
    rag_mock.assert_not_awaited()
    reason_mock.assert_awaited_once()
    call = reason_mock.await_args
    assert call is not None
    assert [p.page_number for p in call.kwargs["pages"]] == [1, 2]
    assert call.kwargs["question"] == "summarise the document"
    assert call.kwargs["answer_type"] is PdfQuestionAnswerResponse


@pytest.mark.anyio
async def test_lookup_question_stays_on_rag_path(runtime_with_stub_rag: AppRuntime) -> None:
    """Targeted lookup questions must not be routed through ChunkedReasoner."""
    await runtime_with_stub_rag.documents.ingest(
        FileId("doc-id"),
        [IngestedPageText(page_number=1, text="Invoice total: 120.00.")],
        source="doc.pdf",
    )

    agent = PdfQuestionAgent(runtime_with_stub_rag)
    canned = PdfQuestionAnswerResponse(answer="120.00", evidence=[])

    with (
        patch.object(agent, "_needs_whole_doc", AsyncMock(return_value=False)),
        patch.object(agent._chunked_reasoner, "reason", AsyncMock()) as reason_mock,
        patch.object(agent, "_run_answer_agent", AsyncMock(return_value=canned)) as rag_mock,
    ):
        response = await agent.handle(
            PdfQuestionRequest(
                question="what is the invoice total?",
                files=[AiFile(id=FileId("doc-id"), name="doc.pdf")],
            )
        )

    assert response is canned
    rag_mock.assert_awaited_once()
    reason_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_multi_file_question_skips_whole_doc_path(runtime_with_stub_rag: AppRuntime) -> None:
    """v1 limitation: ``ChunkedReasoner`` runs single-document only. Multi-file
    requests fall back to the RAG-search path even if the question looks
    whole-doc, and the classifier is short-circuited."""
    for cid in ("doc-a", "doc-b"):
        await runtime_with_stub_rag.documents.ingest(
            FileId(cid),
            [IngestedPageText(page_number=1, text=f"text in {cid}")],
            source=f"{cid}.pdf",
        )

    agent = PdfQuestionAgent(runtime_with_stub_rag)
    canned = PdfQuestionAnswerResponse(answer="answered", evidence=[])

    with (
        patch.object(agent, "_needs_whole_doc", AsyncMock(return_value=True)) as classify_mock,
        patch.object(agent._chunked_reasoner, "reason", AsyncMock()) as reason_mock,
        patch.object(agent, "_run_answer_agent", AsyncMock(return_value=canned)) as rag_mock,
    ):
        response = await agent.handle(
            PdfQuestionRequest(
                question="summarise these documents",
                files=[
                    AiFile(id=FileId("doc-a"), name="a.pdf"),
                    AiFile(id=FileId("doc-b"), name="b.pdf"),
                ],
            )
        )

    assert response is canned
    rag_mock.assert_awaited_once()
    reason_mock.assert_not_awaited()
    classify_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_whole_doc_falls_back_to_rag_when_no_pages_stored(runtime_with_stub_rag: AppRuntime) -> None:
    """Defensive: if a collection somehow has vector chunks but no stored pages
    (an older ingest, a partial state), the whole-doc path falls back to RAG
    rather than raising."""
    agent = PdfQuestionAgent(runtime_with_stub_rag)
    canned = PdfQuestionAnswerResponse(answer="rag answer", evidence=[])

    # Mark the collection as "present" without writing any pages.
    await runtime_with_stub_rag.documents.ingest(
        FileId("vec-only"),
        [IngestedPageText(page_number=1, text="vector content")],
        source="vec.pdf",
    )
    # Drop the page text for this collection but keep the vector chunks.
    store = runtime_with_stub_rag.documents._store
    await _delete_pages(store, "vec-only")

    with (
        patch.object(agent, "_needs_whole_doc", AsyncMock(return_value=True)),
        patch.object(agent._chunked_reasoner, "reason", AsyncMock()) as reason_mock,
        patch.object(agent, "_run_answer_agent", AsyncMock(return_value=canned)) as rag_mock,
    ):
        response = await agent.handle(
            PdfQuestionRequest(
                question="summarise",
                files=[AiFile(id=FileId("vec-only"), name="vec.pdf")],
            )
        )

    assert response is canned
    rag_mock.assert_awaited_once()
    reason_mock.assert_not_awaited()


async def _delete_pages(store: object, collection: str) -> None:
    """Test helper: clear stored pages for a collection without touching vectors.
    Lets us simulate a vector-only state to exercise the whole-doc fallback."""
    await store.add_pages(collection, [])  # type: ignore[attr-defined]
