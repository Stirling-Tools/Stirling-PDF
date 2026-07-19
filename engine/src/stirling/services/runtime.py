from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, assert_never

import httpx
from pydantic_ai import RunContext
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse, infer_model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider
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


# Placeholder when no Anthropic key is set, so a deployment using only another provider
# (Ollama etc.) can still boot. Anthropic calls then fail with a clear 401 instead.
_UNCONFIGURED_ANTHROPIC_KEY = "unconfigured"
_warned_missing_anthropic_key = False


def _anthropic_provider(explicit_key: str | None = None) -> AnthropicProvider:
    """Build the Anthropic provider, tolerating a missing key so an Ollama/OpenAI-only deployment can still boot."""
    http_client = _build_anthropic_http_client()
    key = explicit_key or os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return AnthropicProvider(api_key=key, http_client=http_client)
    global _warned_missing_anthropic_key
    if not _warned_missing_anthropic_key:
        _warned_missing_anthropic_key = True
        logger.warning(
            "ANTHROPIC_API_KEY is not set - the engine will start, but Anthropic model "
            "calls will fail until a key is provided or a different provider is configured "
            "(admin AI settings / config push)."
        )
    return AnthropicProvider(api_key=_UNCONFIGURED_ANTHROPIC_KEY, http_client=http_client)


class _NullContentCoercingTransport(httpx.AsyncHTTPTransport):
    """Coerce assistant ``content: null`` to ``""`` in outgoing OpenAI requests, which Ollama otherwise rejects."""

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("content-type", "").startswith("application/json") and request.content:
            try:
                body = json.loads(request.content)
            except ValueError:
                return await super().handle_async_request(request)
            messages = body.get("messages")
            if isinstance(messages, list):
                changed = False
                for message in messages:
                    if isinstance(message, dict) and message.get("content", "") is None:
                        message["content"] = ""
                        changed = True
                if changed:
                    new_body = json.dumps(body).encode("utf-8")
                    headers = [(k, v) for k, v in request.headers.raw if k.lower() != b"content-length"]
                    request = httpx.Request(
                        method=request.method,
                        url=request.url,
                        headers=headers,
                        content=new_body,
                        extensions=request.extensions,
                    )
        return await super().handle_async_request(request)


def _openai_compat_http_client() -> httpx.AsyncClient:
    """httpx client for Ollama/custom OpenAI-compatible endpoints (null-content fix)."""
    return httpx.AsyncClient(transport=_NullContentCoercingTransport())


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


def _build_documents(settings: AppSettings, embedder: EmbeddingService | None = None) -> DocumentService:
    """Build the document service used for RAG; ``embedder`` lets a cache-restore boot inject a pre-built one."""
    if embedder is None:
        logger.info("Documents: embedding_model=%s", settings.rag_embedding_model)
        embedder = EmbeddingService(
            model_name=settings.rag_embedding_model,
            chunk_size=settings.rag_chunk_size,
            chunk_overlap=settings.rag_chunk_overlap,
        )
    store = _build_document_store(settings)
    return DocumentService(embedder=embedder, store=store, default_top_k=settings.rag_default_top_k)


def build_runtime(
    settings: AppSettings,
    *,
    documents: DocumentService | None = None,
    fast_model: Model | None = None,
    smart_model: Model | None = None,
    embedder: EmbeddingService | None = None,
) -> AppRuntime:
    """Assemble the shared runtime; the keyword args let a config-push reuse the live store and inject built models."""
    fast = fast_model if fast_model is not None else _build_model(settings.fast_model_name)
    smart = smart_model if smart_model is not None else _build_model(settings.smart_model_name)
    validate_structured_output_support(fast, settings.fast_model_name)
    validate_structured_output_support(smart, settings.smart_model_name)

    # One semaphore across both tiers: the cap protects the provider account
    # and process resources, which the tiers share.
    model_semaphore = asyncio.Semaphore(settings.model_max_concurrency)
    return AppRuntime(
        settings=settings,
        fast_model=ConcurrencyLimitedModel(fast, model_semaphore),
        smart_model=ConcurrencyLimitedModel(smart, model_semaphore),
        documents=documents if documents is not None else _build_documents(settings, embedder),
    )


def _build_model(
    model_name: str,
    *,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> Model:
    """Construct a model for ``model_name``; explicit provider/api_key/base_url is the config-push path, else env."""
    if not provider and not api_key and not base_url:
        if model_name.startswith("anthropic:"):
            bare_name = model_name.removeprefix("anthropic:")
            return AnthropicModel(bare_name, provider=_anthropic_provider())
        return infer_model(model_name)

    provider_name = (provider or "").lower()
    key = api_key or None
    if provider_name == "anthropic":
        return AnthropicModel(model_name, provider=_anthropic_provider(key))
    if provider_name == "openai":
        openai_provider = OpenAIProvider(api_key=key) if key else OpenAIProvider()
        return OpenAIChatModel(model_name, provider=openai_provider)
    if provider_name in ("ollama", "custom"):
        # OpenAI-compatible endpoint. Ollama ignores the key but the SDK needs a non-empty
        # one, so default to a placeholder; the custom client coerces null assistant content.
        openai_provider = OpenAIProvider(
            base_url=base_url or None,
            api_key=key or "ollama",
            http_client=_openai_compat_http_client(),
        )
        return OpenAIChatModel(model_name, provider=openai_provider)
    raise ValueError(f"Unsupported model provider {provider!r}.")
