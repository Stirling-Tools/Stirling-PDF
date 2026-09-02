from __future__ import annotations

import pytest

from stirling.agents.operation_shortlist import OperationShortlist, retrieval_text
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
