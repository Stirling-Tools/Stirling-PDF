from __future__ import annotations

import pytest

from stirling.agents.operation_shortlist import (
    OperationShortlist,
    bm25_scores,
    rank_fusion,
    retrieval_text,
    tokenize,
)
from stirling.models import OPERATIONS, ToolEndpoint


class StubEmbedder:
    """Embeds on a single axis: how often 'watermark' appears, so ranking is predictable."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.document_calls = 0

    @staticmethod
    def _vector(text: str) -> list[float]:
        return [float(text.lower().count("watermark")), 1.0]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if self.fail:
            raise RuntimeError("embedding provider unreachable")
        self.document_calls += 1
        return [self._vector(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        if self.fail:
            raise RuntimeError("embedding provider unreachable")
        return self._vector(text)


@pytest.mark.anyio
async def test_returns_every_operation_when_the_limit_is_not_binding() -> None:
    shortlist = OperationShortlist(StubEmbedder())
    operations = list(OPERATIONS)[:5]

    assert await shortlist.select("watermark this", operations, len(operations)) == operations
    assert await shortlist.select("watermark this", operations, 0) == operations


@pytest.mark.anyio
async def test_narrows_to_the_closest_operations() -> None:
    shortlist = OperationShortlist(StubEmbedder())
    operations = list(OPERATIONS)

    selected = await shortlist.select("watermark watermark watermark", operations, 5)

    assert len(selected) == 5
    assert ToolEndpoint.ADD_WATERMARK in selected


@pytest.mark.anyio
async def test_falls_back_to_the_full_catalogue_when_embedding_fails() -> None:
    shortlist = OperationShortlist(StubEmbedder(fail=True))
    operations = list(OPERATIONS)

    assert await shortlist.select("watermark this", operations, 5) == operations


@pytest.mark.anyio
async def test_embeds_the_catalogue_once() -> None:
    embedder = StubEmbedder()
    shortlist = OperationShortlist(embedder)
    operations = list(OPERATIONS)

    await shortlist.select("watermark this", operations, 5)
    await shortlist.select("rotate this", operations, 5)

    assert embedder.document_calls == 1


def test_retrieval_text_carries_parameter_descriptions() -> None:
    text = retrieval_text(ToolEndpoint.ADD_WATERMARK)

    assert "add watermark" in text
    assert "opacity" in text.lower()


def test_lexical_scoring_ranks_the_operation_named_in_the_request() -> None:
    operations = list(OPERATIONS)
    corpus = [tokenize(retrieval_text(operation)) for operation in operations]

    scores = bm25_scores("add a trusted timestamp", corpus)
    best = max(zip(operations, scores, strict=True), key=lambda pair: pair[1])[0]

    assert best is ToolEndpoint.TIMESTAMP_PDF


def test_tokenize_splits_endpoint_names_and_drops_stopwords() -> None:
    assert tokenize("ADD_WATERMARK to the PDF") == ["add", "watermark"]


def test_rank_fusion_promotes_what_both_rankings_rate_highly() -> None:
    first = [ToolEndpoint.ADD_WATERMARK, ToolEndpoint.FLATTEN, ToolEndpoint.REPAIR]
    second = [ToolEndpoint.ADD_WATERMARK, ToolEndpoint.REPAIR, ToolEndpoint.FLATTEN]

    assert rank_fusion(first, second)[0] is ToolEndpoint.ADD_WATERMARK


def test_rank_fusion_surfaces_an_operation_only_one_ranking_found() -> None:
    semantic = [ToolEndpoint.FLATTEN, ToolEndpoint.REPAIR]
    lexical = [ToolEndpoint.TIMESTAMP_PDF, ToolEndpoint.FLATTEN]

    assert ToolEndpoint.TIMESTAMP_PDF in rank_fusion(semantic, lexical)
