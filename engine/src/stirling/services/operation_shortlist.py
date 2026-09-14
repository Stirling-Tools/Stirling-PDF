"""Narrows the operation catalogue to the candidates worth showing the planner."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Protocol

from stirling.contracts.common import ConversationMessage
from stirling.models import OPERATIONS, ToolEndpoint

logger = logging.getLogger(__name__)

QUERY_HISTORY_TURNS = 4
QUERY_TURN_CHARS = 500


class TextEmbedder(Protocol):
    """The slice of an embedding service the shortlist needs; ``EmbeddingService`` satisfies it."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class OperationRanker(Protocol):
    """The ranking surface the planner depends on; :class:`OperationShortlist` is the implementation."""

    async def select(self, query: str, operations: list[ToolEndpoint], limit: int) -> list[ToolEndpoint]: ...


def retrieval_text(operation: ToolEndpoint) -> str:
    model = OPERATIONS[operation]
    description = (model.model_json_schema().get("description") or "").strip()
    parameters = [(field.description or "").strip() for field in model.model_fields.values() if field.description]
    return f"{operation.name.replace('_', ' ').lower()}. {description} {' '.join(parameters)}".strip()


def retrieval_query(message: str, conversation_history: list[ConversationMessage]) -> str:
    """The text to rank operations against: the recent turns plus the current message.

    A follow-up like "do the same to the other file" names no operation, so ranking it alone
    retrieves an arbitrary twenty. The history is truncated because an embedded query that is
    mostly transcript ranks on the transcript rather than on what the user just asked for.
    """
    turns = [
        turn.content.strip()[:QUERY_TURN_CHARS]
        for turn in conversation_history[-QUERY_HISTORY_TURNS:]
        if turn.content.strip()
    ]
    return "\n".join([*turns, message])


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


class OperationShortlist:
    """Ranks the catalogue against a request, caching the catalogue's embedding.

    One instance is shared by every request through :class:`AppRuntime`, so the catalogue is
    embedded once rather than once per planning call. ``resolve_embedder`` is called on each
    ``select`` rather than captured, because an admin config push swaps the embedder onto the
    live document service; the cache is dropped when it returns a different one.
    """

    def __init__(self, resolve_embedder: Callable[[], TextEmbedder]) -> None:
        self._resolve_embedder = resolve_embedder
        self._vectors: dict[ToolEndpoint, list[float]] | None = None
        self._vectors_embedder: TextEmbedder | None = None
        self._lock = asyncio.Lock()

    async def _catalogue_vectors(self, embedder: TextEmbedder) -> dict[ToolEndpoint, list[float]]:
        async with self._lock:
            if self._vectors is None or self._vectors_embedder is not embedder:
                operations = list(OPERATIONS)
                embeddings = await embedder.embed_documents([retrieval_text(op) for op in operations])
                self._vectors = dict(zip(operations, embeddings, strict=True))
                self._vectors_embedder = embedder
            return self._vectors

    async def select(
        self,
        query: str,
        operations: list[ToolEndpoint],
        limit: int,
    ) -> list[ToolEndpoint]:
        """The ``limit`` operations closest to ``query``, or all of them if ranking is unavailable.

        Falling back to the full list keeps a planner that would otherwise work on a deployment
        with no reachable embedding provider, at the cost of a much larger prompt.
        """
        if limit <= 0 or len(operations) <= limit:
            return operations
        embedder = self._resolve_embedder()
        try:
            vectors = await self._catalogue_vectors(embedder)
            query_vector = await embedder.embed_query(query)
        except Exception:  # noqa: BLE001 - any embedding failure should fall back, never fail planning
            logger.warning("[pdf-edit] operation ranking unavailable, showing the full catalogue", exc_info=True)
            return operations
        ranked = sorted(operations, key=lambda op: -_cosine(query_vector, vectors[op]))
        return ranked[:limit]
