"""Narrows the operation catalogue to the candidates worth showing the planner."""

from __future__ import annotations

import asyncio
import logging
from typing import Protocol

from stirling.models import OPERATIONS, ToolEndpoint

logger = logging.getLogger(__name__)


class TextEmbedder(Protocol):
    """The slice of an embedding service the shortlist needs; ``EmbeddingService`` satisfies it."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


def retrieval_text(operation: ToolEndpoint) -> str:
    model = OPERATIONS[operation]
    description = (model.model_json_schema().get("description") or "").strip()
    parameters = [(field.description or "").strip() for field in model.model_fields.values() if field.description]
    return f"{operation.name.replace('_', ' ').lower()}. {description} {' '.join(parameters)}".strip()


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


class OperationShortlist:
    def __init__(self, embedder: TextEmbedder) -> None:
        self._embedder = embedder
        self._vectors: dict[ToolEndpoint, list[float]] | None = None
        self._lock = asyncio.Lock()

    async def _catalogue_vectors(self) -> dict[ToolEndpoint, list[float]]:
        async with self._lock:
            if self._vectors is None:
                operations = list(OPERATIONS)
                embeddings = await self._embedder.embed_documents([retrieval_text(op) for op in operations])
                self._vectors = dict(zip(operations, embeddings, strict=True))
            return self._vectors

    async def select(
        self,
        message: str,
        operations: list[ToolEndpoint],
        limit: int,
    ) -> list[ToolEndpoint]:
        """The ``limit`` operations closest to ``message``, or all of them if ranking is unavailable.

        Falling back to the full list keeps a planner that would otherwise work on a deployment
        with no reachable embedding provider, at the cost of a much larger prompt.
        """
        if limit <= 0 or len(operations) <= limit:
            return operations
        try:
            vectors = await self._catalogue_vectors()
            query = await self._embedder.embed_query(message)
        except Exception:  # noqa: BLE001 - any embedding failure should fall back, never fail planning
            logger.warning("[pdf-edit] operation ranking unavailable, showing the full catalogue", exc_info=True)
            return operations
        ranked = sorted(operations, key=lambda op: -_cosine(query, vectors[op]))
        return ranked[:limit]
