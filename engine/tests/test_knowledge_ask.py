from __future__ import annotations

import pytest

from stirling.agents.knowledge_ask import KnowledgeAskAgent, format_passages, passage_from_hit
from stirling.config import AppSettings
from stirling.contracts import AskDocumentsRequest, DocumentPassage
from stirling.documents import CollectionSearchHit, Document, DocumentService, SearchResult, SqliteVecStore
from stirling.models import FileId, PrincipalId
from stirling.services import build_runtime

PRINCIPALS = [PrincipalId("test-user")]


def _hit(metadata: dict[str, str], text: str = "chunk text", score: float = 0.8) -> CollectionSearchHit:
    return CollectionSearchHit(
        collection=FileId("doc-1"),
        result=SearchResult(document=Document(id="c1", text=text, metadata=metadata), score=score),
    )


# ── passage_from_hit ────────────────────────────────────────────────────


def test_passage_from_hit_maps_docparse_metadata() -> None:
    passage = passage_from_hit(
        _hit({"source": "q2.pdf", "page_start": "2", "page_end": "3", "heading_path": "Report > Finance"})
    )
    assert passage.document_id == "doc-1"
    assert passage.page_start == 2
    assert passage.page_end == 3
    assert passage.heading_path == ["Report", "Finance"]
    assert passage.source == "q2.pdf"


def test_passage_from_hit_falls_back_to_page_number() -> None:
    """Plain page-text chunks: page_number fills both bounds, source drops the page suffix."""
    passage = passage_from_hit(_hit({"source": "report.pdf:page:4", "page_number": "4"}))
    assert passage.page_start == 4
    assert passage.page_end == 4
    assert passage.heading_path == []
    assert passage.source == "report.pdf"


def test_passage_from_hit_tolerates_missing_and_bad_metadata() -> None:
    passage = passage_from_hit(_hit({"page_start": "not-a-number"}))
    assert passage.page_start is None
    assert passage.page_end is None
    assert passage.heading_path == []
    assert passage.source is None


# ── format_passages ─────────────────────────────────────────────────────


def test_format_passages_includes_citation_handles() -> None:
    passages = [
        DocumentPassage(document_id=FileId("d1"), text="Alpha.", score=0.9, page_start=2, page_end=3, source="a.pdf"),
        DocumentPassage(document_id=FileId("d2"), text="Beta.", score=0.5, page_start=7, page_end=7, source="b.pdf"),
        DocumentPassage(document_id=FileId("d3"), text="Gamma.", score=0.4),
    ]
    rendered = format_passages(passages)
    assert "[Passage 1 | a.pdf p.2-3]\nAlpha." in rendered
    assert "[Passage 2 | b.pdf p.7]\nBeta." in rendered
    # No source or pages: fall back to the document id alone.
    assert "[Passage 3 | d3]\nGamma." in rendered


# ── KnowledgeAskAgent ───────────────────────────────────────────────────


class _StubEmbedder:
    """Deterministic embeddings so the agent test needs no provider."""

    async def embed_query(self, text: str) -> list[float]:
        return [1.0, 0.0]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0] for _ in texts]


@pytest.mark.anyio
async def test_ask_answers_plainly_when_nothing_retrieved(app_settings: AppSettings) -> None:
    """Empty retrieval short-circuits: no model call, honest not-found answer."""
    documents = DocumentService(embedder=_StubEmbedder(), store=SqliteVecStore.ephemeral(), default_top_k=3)  # type: ignore[arg-type]
    runtime = build_runtime(app_settings, documents=documents)
    agent = KnowledgeAskAgent(runtime)

    response = await agent.ask(AskDocumentsRequest(question="What is the launch date?"), principals=PRINCIPALS)
    assert response.passages == []
    assert "couldn't find" in response.answer
