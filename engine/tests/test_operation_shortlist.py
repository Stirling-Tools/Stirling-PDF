from __future__ import annotations

import pytest

from stirling.contracts import ConversationMessage
from stirling.models import OPERATIONS, ToolEndpoint
from stirling.services.operation_shortlist import (
    QUERY_HISTORY_TURNS,
    QUERY_TURN_CHARS,
    OperationShortlist,
    retrieval_query,
    retrieval_text,
)


class StubEmbedder:
    """Embeds on a single axis: how often 'watermark' appears, so ranking is predictable."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.document_calls = 0
        self.queries: list[str] = []

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
        self.queries.append(text)
        return self._vector(text)


@pytest.mark.anyio
async def test_returns_every_operation_when_the_limit_is_not_binding() -> None:
    shortlist = OperationShortlist(StubEmbedder)  # never resolved: the limit short-circuits first
    operations = list(OPERATIONS)[:5]

    assert await shortlist.select("watermark this", operations, len(operations)) == operations
    assert await shortlist.select("watermark this", operations, 0) == operations


@pytest.mark.anyio
async def test_narrows_to_the_closest_operations() -> None:
    embedder = StubEmbedder()
    shortlist = OperationShortlist(lambda: embedder)
    operations = list(OPERATIONS)

    selected = await shortlist.select("watermark watermark watermark", operations, 5)

    assert len(selected) == 5
    assert ToolEndpoint.ADD_WATERMARK in selected


@pytest.mark.anyio
async def test_falls_back_to_the_full_catalogue_when_embedding_fails() -> None:
    embedder = StubEmbedder(fail=True)
    shortlist = OperationShortlist(lambda: embedder)
    operations = list(OPERATIONS)

    assert await shortlist.select("watermark this", operations, 5) == operations


@pytest.mark.anyio
async def test_embeds_the_catalogue_once() -> None:
    embedder = StubEmbedder()
    shortlist = OperationShortlist(lambda: embedder)
    operations = list(OPERATIONS)

    await shortlist.select("watermark this", operations, 5)
    await shortlist.select("rotate this", operations, 5)

    assert embedder.document_calls == 1


@pytest.mark.anyio
async def test_re_embeds_the_catalogue_when_the_embedder_is_swapped() -> None:
    embedders = [StubEmbedder(), StubEmbedder()]
    shortlist = OperationShortlist(lambda: embedders[-1])
    operations = list(OPERATIONS)

    await shortlist.select("watermark this", operations, 5)
    embedders.append(StubEmbedder())
    await shortlist.select("watermark this", operations, 5)

    assert [embedder.document_calls for embedder in embedders] == [0, 1, 1]


def test_retrieval_text_carries_parameter_descriptions() -> None:
    text = retrieval_text(ToolEndpoint.ADD_WATERMARK)

    assert "add watermark" in text
    assert "opacity" in text.lower()


def test_retrieval_query_carries_the_recent_conversation() -> None:
    query = retrieval_query(
        "do the same to the other file",
        [
            ConversationMessage(role="user", content="add a watermark saying DRAFT"),
            ConversationMessage(role="assistant", content="Watermarked report.pdf."),
        ],
    )

    assert "watermark" in query
    assert query.endswith("do the same to the other file")


def test_retrieval_query_bounds_the_history_it_carries() -> None:
    history = [ConversationMessage(role="user", content=f"turn {index} " + "x" * 2_000) for index in range(10)]

    query = retrieval_query("rotate it", history)

    assert query.startswith(f"turn {len(history) - QUERY_HISTORY_TURNS} ")
    assert "turn 0" not in query
    assert len(query) <= QUERY_HISTORY_TURNS * (QUERY_TURN_CHARS + 1) + len("rotate it")


@pytest.mark.anyio
async def test_a_follow_up_turn_still_ranks_the_operation_it_refers_to() -> None:
    embedder = StubEmbedder()
    shortlist = OperationShortlist(lambda: embedder)
    operations = list(OPERATIONS)
    history = [ConversationMessage(role="user", content="add a watermark saying DRAFT")]

    selected = await shortlist.select(retrieval_query("do the same to the other file", history), operations, 5)

    assert ToolEndpoint.ADD_WATERMARK in selected
