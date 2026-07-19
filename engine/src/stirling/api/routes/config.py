from __future__ import annotations

import ipaddress
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from openai import OpenAIError
from pydantic_ai.exceptions import UserError
from pydantic_ai.models import Model

from stirling.api.bootstrap import apply_app_state, build_app_state
from stirling.config import AppSettings
from stirling.config.config_cache import cache_stamp, save_config
from stirling.contracts import ConfigApplyResponse, ConfigPushRequest
from stirling.documents import EmbeddingService
from stirling.services import AppRuntime
from stirling.services.runtime import _build_model, validate_structured_output_support

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/config", tags=["config"])

# Model/provider construction + validation failures. The HTTP route maps these to a
# 400 (no swap); boot catches them to fall back to env when a cached config is bad.
CONFIG_APPLY_ERRORS = (ValueError, UserError, OpenAIError)

_REINDEX_NOTE = (
    "Embedding model changed; existing indexed documents were embedded with the previous model and "
    "must be re-indexed. If the embedding dimensionality changed, re-ingest before searching."
)


def _strip_provider_prefix(model_name: str) -> str:
    """Drop a leading ``provider:`` from an env model string ("anthropic:x" -> "x").

    Only used when falling back to a model name that is still env-shaped, i.e. when no
    provider has been pushed yet. A name that arrived on a push is already bare and may
    itself contain ``:`` ("llama3.1:8b"), so it must never be passed through here - see
    the ``current.chat_provider`` guard in :func:`resolve_and_apply`.
    """
    _, sep, rest = model_name.partition(":")
    return rest if sep else model_name


def _compose_embedding_model(provider: str, model: str) -> str:
    """Compose the engine's ``provider:model`` embedding string from pushed parts."""
    provider = provider.strip()
    return f"{provider}:{model}" if provider else model


def _split_embedding_ref(ref: str) -> tuple[str, str]:
    """Split an env embedding string ("voyageai:voyage-4") into (provider, model)."""
    provider, sep, model = ref.partition(":")
    return (provider, model) if sep else ("", ref)


def _keep(pushed: int | None, current: int) -> int:
    """Return the pushed value, or the current one when the push omitted it."""
    return pushed if pushed is not None else current


# Headers that indicate a proxy sits in front of us. Their presence means
# ``request.client.host`` cannot be trusted as the true transport peer: uvicorn's
# ProxyHeadersMiddleware rewrites the client from ``X-Forwarded-For`` when a proxy is
# trusted, so a spoofed ``X-Forwarded-For: 127.0.0.1`` would otherwise read as loopback.
_FORWARDING_HEADERS = ("x-forwarded-for", "x-forwarded-host", "x-real-ip", "forwarded")


def _is_direct_loopback_client(request: Request) -> bool:
    """True only for a *direct* local connection with no proxy in front.

    Used as the sole authorization for config push when no shared secret is set, so it
    must fail closed the moment a proxy is involved. Any forwarding header present means
    the peer address may have been rewritten (or the caller is remote-behind-a-proxy), so
    we refuse to treat it as local and require an explicit shared secret instead.
    """
    if any(h in request.headers for h in _FORWARDING_HEADERS):
        return False
    client = request.client
    if client is None:
        return False
    try:
        return ipaddress.ip_address(client.host).is_loopback
    except ValueError:
        return client.host == "localhost"


def resolve_and_apply(
    current: AppSettings,
    request: ConfigPushRequest,
) -> tuple[AppSettings, Model, Model, EmbeddingService | None, list[str]]:
    """Resolve a pushed config against the running settings.

    Builds and validates the smart/fast models, resolves the scalar overrides,
    and builds a new embedder when the embedding config changed. Empty/None pushed
    fields keep the current value. Returns the effective settings, the two built
    models, an optional new embedder (None when the embedding config is unchanged),
    and human-readable notes.

    Raises one of :data:`CONFIG_APPLY_ERRORS` if a chosen model/embedder fails to
    build or validate; callers decide whether that becomes a 400 (HTTP route) or an
    env fallback (boot). It never swaps any live state - the caller owns that.
    """
    models = request.models
    rag = request.rag
    limits = request.limits
    notes: list[str] = []

    provider = models.provider.strip()
    api_key = models.api_key
    base_url = models.base_url
    use_explicit_provider = bool(provider or api_key or base_url)

    if use_explicit_provider and not current.chat_provider:
        # First push over an env-configured engine: the running names are still
        # "provider:model", so strip the prefix before handing them to the pushed provider.
        smart_name = models.smart_model or _strip_provider_prefix(current.smart_model_name)
        fast_name = models.fast_model or _strip_provider_prefix(current.fast_model_name)
    elif use_explicit_provider:
        # A provider was already pushed, so the running names are bare and may legitimately
        # contain a colon ("llama3.1:8b"). Stripping again would truncate them to "8b".
        smart_name = models.smart_model or current.smart_model_name
        fast_name = models.fast_model or current.fast_model_name
    else:
        # No provider/credentials pushed: keep the fully env-driven model strings.
        smart_name = models.smart_model or current.smart_model_name
        fast_name = models.fast_model or current.fast_model_name

    def _build(bare: str) -> Model:
        if use_explicit_provider:
            return _build_model(bare, provider=provider or None, api_key=api_key or None, base_url=base_url or None)
        return _build_model(bare)

    smart_model = _build(smart_name)
    fast_model = _build(fast_name)
    validate_structured_output_support(smart_model, smart_name)
    validate_structured_output_support(fast_model, fast_name)

    # Scalars: None / empty keep the current value.
    smart_max_tokens = _keep(models.smart_max_tokens, current.smart_model_max_tokens)
    fast_max_tokens = _keep(models.fast_max_tokens, current.fast_model_max_tokens)
    top_k = _keep(rag.top_k, current.rag_default_top_k)
    max_searches = _keep(rag.max_searches, current.rag_max_searches)
    max_pages = _keep(limits.max_pages, current.max_pages)
    max_characters = _keep(limits.max_characters, current.max_characters)
    model_max_concurrency = _keep(limits.model_max_concurrency, current.model_max_concurrency)

    # Embedding: any non-empty embedding field triggers a rebuild; empty fields fall
    # back to the running provider/model/creds so a partial push never clobbers env.
    embedding_changed = bool(
        rag.embedding_provider.strip() or rag.embedding_model.strip() or rag.embedding_api_key or rag.embedding_base_url
    )
    rag_embedding_model = current.rag_embedding_model
    new_embedder: EmbeddingService | None = None
    if embedding_changed:
        current_provider, current_model = _split_embedding_ref(current.rag_embedding_model)
        embed_provider = rag.embedding_provider.strip() or current_provider
        embed_model = rag.embedding_model.strip() or current_model
        rag_embedding_model = _compose_embedding_model(embed_provider, embed_model)
        new_embedder = EmbeddingService(
            model_name=embed_model,
            chunk_size=current.rag_chunk_size,
            chunk_overlap=current.rag_chunk_overlap,
            provider=embed_provider or None,
            api_key=rag.embedding_api_key or None,
            base_url=rag.embedding_base_url or None,
        )
        notes.append(_REINDEX_NOTE)

    effective = current.model_copy(
        update={
            "chat_provider": provider,
            "smart_model_name": smart_name,
            "fast_model_name": fast_name,
            "smart_model_max_tokens": smart_max_tokens,
            "fast_model_max_tokens": fast_max_tokens,
            "rag_embedding_model": rag_embedding_model,
            "rag_default_top_k": top_k,
            "rag_max_searches": max_searches,
            "max_pages": max_pages,
            "max_characters": max_characters,
            "model_max_concurrency": model_max_concurrency,
        }
    )
    return effective, smart_model, fast_model, new_embedder, notes


def apply_to_app(app: Any, request: ConfigPushRequest) -> tuple[AppSettings, list[str]]:
    """Resolve ``request`` against the app's live settings and swap the bundle in place.

    Rebuilds the runtime and every agent, reusing the existing document store, then swaps
    the whole bundle onto ``app.state`` so in-flight lookups only ever see one config.
    Contains no ``await``, so the swap is atomic with respect to the event loop.

    Raises one of :data:`CONFIG_APPLY_ERRORS` if the pushed config cannot be built; live
    state is left untouched in that case. Shared by the HTTP route and the cache watcher.
    """
    current: AppSettings = app.state.settings
    runtime: AppRuntime = app.state.runtime
    effective, smart_model, fast_model, new_embedder, notes = resolve_and_apply(current, request)
    new_state = build_app_state(
        effective,
        documents=runtime.documents,
        fast_model=fast_model,
        smart_model=smart_model,
    )
    app.state.settings = effective
    apply_app_state(app.state, new_state)
    # Retune retrieval breadth on the reused store without rebuilding it.
    runtime.documents.default_top_k = effective.rag_default_top_k
    if new_embedder is not None:
        # Swap the embedder onto the reused DocumentService so we never tear down
        # the live vector store / connection pool.
        runtime.documents.embedder = new_embedder
    return effective, notes


@router.post("", response_model=ConfigApplyResponse)
async def apply_config(request: ConfigPushRequest, http_request: Request) -> ConfigApplyResponse:
    """Apply admin-pushed AI settings by rebuilding the runtime + agents in place.

    Gated by the X-Engine-Auth shared secret (global middleware) plus the
    ``allow_config_push`` flag. Empty credential/model fields keep the engine's
    env-configured values. Returns 403 when config push is disabled, 400 (without
    swapping state) when a chosen model fails to build/validate. On success the
    config is also persisted (encrypted) so it survives an engine restart.
    """
    app = http_request.app
    current: AppSettings = app.state.settings
    if not current.allow_config_push:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Config push is disabled on this deployment (STIRLING_ALLOW_CONFIG_PUSH is false).",
        )
    # Secure-by-default for this sensitive endpoint. When a shared secret is set the
    # global middleware has already authenticated the caller (only the processor has the
    # secret). When NO secret is set, only trust a *direct* loopback caller - a remote
    # party must never be able to push a config unauthenticated, since a pushed
    # base_url/model could repoint the engine to exfiltrate document content. We refuse
    # the moment any proxy header is present because ``request.client.host`` is then
    # spoofable (uvicorn rewrites it from X-Forwarded-For behind a trusted proxy), so a
    # deployment behind a reverse proxy / LB MUST set a shared secret.
    if not current.engine_shared_secret and not _is_direct_loopback_client(http_request):
        client_host = http_request.client.host if http_request.client else "unknown"
        logger.warning(
            "Rejected config push from non-local/proxied caller %s with no shared secret set",
            client_host,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Config push from a non-local or proxied caller requires"
                " STIRLING_ENGINE_SHARED_SECRET to be set on both the engine and the processor."
            ),
        )

    try:
        effective, notes = apply_to_app(app, request)
    except CONFIG_APPLY_ERRORS as exc:
        # Reject without touching the running config.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Persist the applied config (encrypted) so it is restored on the next boot, and so
    # sibling worker processes - which never saw this request - can adopt it from the
    # shared cache file. Persistence is best-effort: the config is already applied live
    # above, so a persist failure of ANY kind (bad/corrupt keyfile -> ValueError, disk
    # error -> OSError, etc.) must never turn a successful apply into a 500 and leave
    # live/reported state diverged.
    try:
        save_config(request)
        # Claim the stamp we just wrote so this worker's own watcher does not
        # immediately rebuild everything for a config it is already running.
        app.state.config_cache_stamp = cache_stamp()
    except Exception:  # noqa: BLE001 - best-effort persist, never fail the applied push
        logger.warning("Applied AI config but failed to persist the encrypted cache", exc_info=True)
        notes.append(
            "Config applied on this worker but could not be persisted; it will not survive an"
            " engine restart and other workers will not pick it up."
        )

    logger.info(
        "Applied pushed AI config: provider=%s smart_model=%s fast_model=%s top_k=%s",
        request.models.provider.strip() or "<env>",
        effective.smart_model_name,
        effective.fast_model_name,
        effective.rag_default_top_k,
    )

    return ConfigApplyResponse(
        status="applied",
        provider=request.models.provider.strip(),
        smart_model=effective.smart_model_name,
        fast_model=effective.fast_model_name,
        smart_max_tokens=effective.smart_model_max_tokens,
        fast_max_tokens=effective.fast_model_max_tokens,
        rag_embedding_model=effective.rag_embedding_model,
        rag_top_k=effective.rag_default_top_k,
        rag_max_searches=effective.rag_max_searches,
        max_pages=effective.max_pages,
        max_characters=effective.max_characters,
        model_max_concurrency=effective.model_max_concurrency,
        notes=notes,
    )
