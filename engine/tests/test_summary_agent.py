from __future__ import annotations

from dataclasses import replace

import pytest

from stirling.agents import SummaryAgent
from stirling.contracts import (
    NeedIngestResponse,
    PdfContentType,
    SummaryAnswerResponse,
    SummaryNotFoundResponse,
    SummaryRequest,
    SummarySection,
    SummaryTerminalResponse,
    SupportedCapability,
)
from stirling.rag import Document, RagService, SqliteVecStore
from stirling.services.runtime import AppRuntime


class StubEmbedder:
    """Deterministic embeddings so the summary agent's RAG lookups work in tests."""

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


class StubSummaryAgent(SummaryAgent):
    def __init__(self, runtime: AppRuntime, response: SummaryTerminalResponse) -> None:
        super().__init__(runtime)
        self._response = response

    async def _run_summary_agent(
        self,
        request: SummaryRequest,
        collections: list[str],
    ) -> SummaryTerminalResponse:
        return self._response


@pytest.fixture
def runtime_with_stub_rag(runtime: AppRuntime) -> AppRuntime:
    """Return a runtime whose RAG service uses a stub embedder + ephemeral store,
    so tests never touch the network."""
    stub = RagService(
        embedder=StubEmbedder(),  # type: ignore[arg-type]
        store=SqliteVecStore.ephemeral(),
        default_top_k=runtime.settings.rag_default_top_k,
    )
    return replace(runtime, rag_service=stub)


@pytest.mark.anyio
async def test_summary_agent_requests_ingest_when_document_missing(runtime_with_stub_rag: AppRuntime) -> None:
    agent = SummaryAgent(runtime_with_stub_rag)

    response = await agent.handle(SummaryRequest(document_ids=["missing-doc"]))

    assert isinstance(response, NeedIngestResponse)
    assert response.resume_with == SupportedCapability.PDF_SUMMARY
    assert response.document_ids == ["missing-doc"]
    assert PdfContentType.PAGE_TEXT in response.content_types


@pytest.mark.anyio
async def test_summary_agent_reports_only_missing_document_ids(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.rag_service.index_text(
        collection="present-doc",
        text="Some content for the document.",
        source="present-doc",
    )
    agent = SummaryAgent(runtime_with_stub_rag)

    response = await agent.handle(SummaryRequest(document_ids=["present-doc", "missing-doc"]))

    assert isinstance(response, NeedIngestResponse)
    assert response.document_ids == ["missing-doc"]


@pytest.mark.anyio
async def test_summary_agent_returns_structured_summary(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.rag_service.index_text(
        collection="report",
        text="The quarterly report covers revenue, costs, and outlook.",
        source="report",
    )
    agent = StubSummaryAgent(
        runtime_with_stub_rag,
        SummaryAnswerResponse(
            tldr="Quarterly report summary.",
            key_points=["Revenue grew.", "Costs held flat.", "Outlook is positive."],
            sections=[SummarySection(heading="Outlook", summary="Positive.")],
        ),
    )

    response = await agent.handle(SummaryRequest(document_ids=["report"], focus="financials"))

    assert isinstance(response, SummaryAnswerResponse)
    assert response.tldr == "Quarterly report summary."
    assert len(response.key_points) == 3


@pytest.mark.anyio
async def test_summary_agent_can_return_not_found(runtime_with_stub_rag: AppRuntime) -> None:
    await runtime_with_stub_rag.rag_service.index_text(
        collection="thin-doc",
        text="A short blurb.",
        source="thin-doc",
    )
    agent = StubSummaryAgent(
        runtime_with_stub_rag,
        SummaryNotFoundResponse(reason="The document does not contain enough content to summarise."),
    )

    response = await agent.handle(SummaryRequest(document_ids=["thin-doc"]))

    assert isinstance(response, SummaryNotFoundResponse)
