from __future__ import annotations

from dataclasses import replace

import pytest

from stirling.agents import PdfQuestionAgent
from stirling.contracts import (
    AiFile,
    ExtractedFileText,
    NeedIngestResponse,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionTerminalResponse,
    PdfTextSelection,
    SupportedCapability,
)
from stirling.models import FileId
from stirling.rag import Document, RagService, SqliteVecStore
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
        from stirling.rag.chunker import chunk_text

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


@pytest.fixture
def runtime_with_stub_rag(runtime: AppRuntime) -> AppRuntime:
    """A runtime whose RAG service uses a stub embedder + ephemeral store."""
    stub = RagService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, rag_service=stub)


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
    await runtime_with_stub_rag.rag_service.index_text(
        collection=FileId("present-id"),
        text="Invoice total: 120.00.",
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
    await runtime_with_stub_rag.rag_service.index_text(
        collection=FileId("invoice-id"),
        text="Invoice total: 120.00.",
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
    await runtime_with_stub_rag.rag_service.index_text(
        collection=FileId("shipping-id"),
        text="This page contains only a shipping address.",
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
