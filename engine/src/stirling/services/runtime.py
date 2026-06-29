from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, assert_never

import httpx
from pydantic_ai import RunContext
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse, infer_model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.settings import ModelSettings

from stirling.config import ENGINE_ROOT, AppSettings, DocumentsBackend
from stirling.documents import (
    DocumentService,
    DocumentStore,
    EmbeddingService,
    PgVectorStore,
    SqliteVecStore,
)

logger = logging.getLogger(__name__)


def _build_anthropic_http_client() -> httpx.AsyncClient:
    """Build the httpx client used for Anthropic API calls.

    We disable connection-pool keepalive so every request opens a fresh
    TCP+TLS connection. The default HTTP/1.1 pool reuses connections that
    Anthropic's front door (Cloudflare) sometimes closes silently between
    requests; the next request that picks up a stale connection sends its
    body into a black hole and never gets a response, hanging until our
    chunked-reasoner timeout fires.

    A fresh handshake costs ~150ms — rounding error against a 5-15s LLM
    call. The trade is determinism: we never reuse a connection that might
    have died in the pool. See ``STIRLING_HTTP_DEBUG`` traces of slice 6
    on 2026-05-06 for the concrete failure mode this addresses.
    """
    return httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=0),
        timeout=httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=5.0),
    )


class ConcurrencyLimitedModel(WrapperModel):
    """Caps in-flight model API calls with a semaphore shared across the process."""

    def __init__(self, wrapped: Model, semaphore: asyncio.Semaphore) -> None:
        super().__init__(wrapped)
        self._semaphore = semaphore

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        async with self._semaphore:
            return await super().request(messages, model_settings, model_request_parameters)

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: RunContext[Any] | None = None,
    ) -> AsyncIterator[StreamedResponse]:
        async with self._semaphore:
            async with super().request_stream(
                messages, model_settings, model_request_parameters, run_context
            ) as response_stream:
                yield response_stream


@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    fast_model: Model
    smart_model: Model
    documents: DocumentService

    @property
    def fast_model_settings(self) -> ModelSettings:
        return build_model_settings(self.settings.fast_model_max_tokens)

    @property
    def smart_model_settings(self) -> ModelSettings:
        return build_model_settings(self.settings.smart_model_max_tokens)


def build_model_settings(max_tokens: int | None) -> ModelSettings:
    model_settings: ModelSettings = {}
    if max_tokens is not None:
        model_settings["max_tokens"] = max_tokens
    return model_settings


def validate_structured_output_support(model: Model, model_name: str) -> None:
    # Pydantic AI's dedicated test model does not advertise native structured output,
    # but we still use it in unit tests as a non-production stand-in.
    if model_name == "test":
        return
    if not model.profile.supports_json_schema_output:
        raise ValueError(f"Unsupported model {model_name}. This model does not support structured outputs.")


def _build_document_store(settings: AppSettings) -> DocumentStore:
    """Build the configured document store backend."""
    if settings.documents_backend == DocumentsBackend.SQLITE:
        store_path = settings.documents_sqlite_path
        # Treat ":memory:" as a special in-process token; otherwise resolve against the engine root.
        if str(store_path) != ":memory:" and not store_path.is_absolute():
            store_path = ENGINE_ROOT / store_path
        logger.info("Document store backend=sqlite, db_path=%s", store_path)
        return SqliteVecStore(db_path=store_path)
    if settings.documents_backend == DocumentsBackend.PGVECTOR:
        logger.info("Document store backend=pgvector, dsn=<configured>")
        return PgVectorStore(
            dsn=settings.documents_pgvector_dsn,
            pool_min_size=settings.documents_pgvector_pool_min_size,
            pool_max_size=settings.documents_pgvector_pool_max_size,
        )
    assert_never(settings.documents_backend)


def _build_documents(settings: AppSettings) -> DocumentService:
    """Build the document service used by per-request RAG capabilities."""
    logger.info("Documents: embedding_model=%s", settings.rag_embedding_model)
    embedder = EmbeddingService(
        model_name=settings.rag_embedding_model,
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
    )
    store = _build_document_store(settings)
    return DocumentService(embedder=embedder, store=store, default_top_k=settings.rag_default_top_k)


def build_runtime(settings: AppSettings) -> AppRuntime:
    fast_model = _build_model(settings.fast_model_name)
    smart_model = _build_model(settings.smart_model_name)
    validate_structured_output_support(fast_model, settings.fast_model_name)
    validate_structured_output_support(smart_model, settings.smart_model_name)

    # One semaphore across both tiers: the cap protects the provider account
    # and process resources, which the tiers share.
    model_semaphore = asyncio.Semaphore(settings.model_max_concurrency)
    return AppRuntime(
        settings=settings,
        fast_model=ConcurrencyLimitedModel(fast_model, model_semaphore),
        smart_model=ConcurrencyLimitedModel(smart_model, model_semaphore),
        documents=_build_documents(settings),
    )


def _build_model(model_name: str) -> Model:
    """Construct a model, injecting our keepalive-free httpx client for
    Anthropic models so workers don't pick up stale pooled connections.

    Other providers fall back to ``infer_model`` defaults; the stale-pool
    issue is specific to the Cloudflare-fronted Anthropic API in our
    observations and the fix doesn't necessarily apply elsewhere.
    """
    if model_name.startswith("anthropic:"):
        bare_name = model_name.removeprefix("anthropic:")
        provider = AnthropicProvider(http_client=_build_anthropic_http_client())
        return AnthropicModel(bare_name, provider=provider)
    return infer_model(model_name)
