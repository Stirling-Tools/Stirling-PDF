"""Narrows the operation catalogue to the candidates worth showing the planner."""

from __future__ import annotations

import asyncio
import logging
import math
import re
from collections import Counter
from collections.abc import Callable
from typing import Protocol

from stirling.contracts.common import ConversationMessage
from stirling.models import OPERATIONS, ToolEndpoint

logger = logging.getLogger(__name__)

_WORD = re.compile(r"\w+", re.UNICODE)
_STOPWORDS = frozenset({"pdf", "the", "this", "a", "an", "of", "to", "and", "for", "it", "into", "out"})

_BM25_K1 = 1.5
_BM25_B = 0.75
_RRF_K = 60


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


def tokenize(text: str) -> list[str]:
    """The lexical terms of ``text``: lowercased, split on non-word characters, stopwords dropped.

    The same normalisation must be applied to a query and to the corpus it is scored against,
    so ``bm25_scores`` expects a corpus tokenized by this function and nothing else. Scripts
    that are not word-segmented by whitespace (CJK) yield one token per run of characters, and
    a text with no word characters at all yields ``[]``.
    """
    return [word for word in _WORD.findall(text.lower().replace("_", " ")) if word not in _STOPWORDS]


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def bm25_scores(query: str, corpus: list[list[str]]) -> list[float]:
    """BM25 relevance of a raw ``query`` against a corpus already tokenized by ``tokenize``.

    Scores are positionally aligned with ``corpus``. A score of 0.0 means no query term
    occurs in that document, not that the document ranks last, so a caller ordering by score
    must drop the zeros rather than treat their arbitrary order as a ranking.
    """
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
        self._tokens: dict[ToolEndpoint, list[str]] = {}
        self._lock = asyncio.Lock()

    async def _catalogue_vectors(self, embedder: TextEmbedder) -> dict[ToolEndpoint, list[float]]:
        async with self._lock:
            if self._vectors is None or self._vectors_embedder is not embedder:
                operations = list(OPERATIONS)
                texts = [retrieval_text(operation) for operation in operations]
                embeddings = await embedder.embed_documents(texts)
                self._vectors = dict(zip(operations, embeddings, strict=True))
                self._vectors_embedder = embedder
                self._tokens = {operation: tokenize(text) for operation, text in zip(operations, texts, strict=True)}
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
        semantic = sorted(operations, key=lambda operation: -_cosine(query_vector, vectors[operation]))
        corpus = [self._tokens.get(operation, []) for operation in operations]
        lexical_scores = bm25_scores(query, corpus)
        by_score = dict(zip(operations, lexical_scores, strict=True))
        matched = [operation for operation in operations if by_score[operation] > 0.0]
        lexical = sorted(matched, key=lambda operation: -by_score[operation])
        return rank_fusion(semantic, lexical)[:limit]
