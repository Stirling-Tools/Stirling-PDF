"""Narrows the operation catalogue to the candidates worth showing the planner."""

from __future__ import annotations

import asyncio
import logging
import math
import re
from collections import Counter

from stirling.documents import EmbeddingService
from stirling.models import OPERATIONS, ToolEndpoint

logger = logging.getLogger(__name__)

_WORD = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset({"pdf", "the", "this", "a", "an", "of", "to", "and", "for", "it", "into", "out"})

_BM25_K1 = 1.5
_BM25_B = 0.75
_RRF_K = 60


def retrieval_text(operation: ToolEndpoint) -> str:
    model = OPERATIONS[operation]
    description = (model.model_json_schema().get("description") or "").strip()
    parameters = [(field.description or "").strip() for field in model.model_fields.values() if field.description]
    return f"{operation.name.replace('_', ' ').lower()}. {description} {' '.join(parameters)}".strip()


def tokenize(text: str) -> list[str]:
    return [word for word in _WORD.findall(text.lower().replace("_", " ")) if word not in _STOPWORDS]


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def bm25_scores(query: str, corpus: list[list[str]]) -> list[float]:
    lengths = [len(document) for document in corpus]
    average_length = sum(lengths) / len(lengths) if lengths else 0.0
    document_frequency: Counter[str] = Counter()
    for document in corpus:
        document_frequency.update(set(document))

    total = len(corpus)
    scores = [0.0] * total
    for term in tokenize(query):
        frequency = document_frequency.get(term, 0)
        if not frequency:
            continue
        idf = math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))
        for index, document in enumerate(corpus):
            occurrences = document.count(term)
            if occurrences:
                length_norm = 1 - _BM25_B + _BM25_B * lengths[index] / average_length
                scores[index] += idf * (occurrences * (_BM25_K1 + 1)) / (occurrences + _BM25_K1 * length_norm)
    return scores


def rank_fusion(*rankings: list[ToolEndpoint]) -> list[ToolEndpoint]:
    """Reciprocal rank fusion, which combines rankings without needing comparable scores."""
    fused: dict[ToolEndpoint, float] = {}
    for ranking in rankings:
        for position, operation in enumerate(ranking):
            fused[operation] = fused.get(operation, 0.0) + 1.0 / (_RRF_K + position + 1)
    return sorted(fused, key=lambda operation: -fused[operation])


class OperationShortlist:
    def __init__(self, embedder: EmbeddingService) -> None:
        self._embedder = embedder
        self._vectors: dict[ToolEndpoint, list[float]] | None = None
        self._tokens: dict[ToolEndpoint, list[str]] = {}
        self._lock = asyncio.Lock()

    async def _catalogue_vectors(self) -> dict[ToolEndpoint, list[float]]:
        async with self._lock:
            if self._vectors is None:
                operations = list(OPERATIONS)
                texts = [retrieval_text(operation) for operation in operations]
                embeddings = await self._embedder.embed_documents(texts)
                self._vectors = dict(zip(operations, embeddings, strict=True))
                self._tokens = {operation: tokenize(text) for operation, text in zip(operations, texts, strict=True)}
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

        semantic = sorted(operations, key=lambda operation: -_cosine(query, vectors[operation]))
        corpus = [self._tokens.get(operation, []) for operation in operations]
        lexical_scores = bm25_scores(message, corpus)
        by_score = dict(zip(operations, lexical_scores, strict=True))
        lexical = sorted(operations, key=lambda operation: -by_score[operation])
        return rank_fusion(semantic, lexical)[:limit]
