from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.instrumented import InstrumentationSettings

from stirling.api.bootstrap import apply_app_state, build_app_state
from stirling.api.dependencies import enforce_required_user_id
from stirling.api.engine_auth import EngineSharedSecretMiddleware
from stirling.api.middleware import UserIdMiddleware
from stirling.api.routes import (
    agent_capabilities_router,
    agent_draft_router,
    config_router,
    document_classifier_router,
    document_router,
    execution_router,
    ledger_router,
    orchestrator_router,
    pdf_comments_router,
    pdf_edit_router,
    pdf_question_router,
)
from stirling.api.routes.config import CONFIG_APPLY_ERRORS, resolve_and_apply
from stirling.config import AppSettings, load_settings
from stirling.config.config_cache import load_config
from stirling.contracts import HealthResponse
from stirling.documents import DocumentService, EmbeddingService
from stirling.services import setup_posthog_tracking

logger = logging.getLogger(__name__)


async def _run_expired_doc_reaper(
    documents: DocumentService,
    interval_seconds: int,
) -> None:
    """Periodically delete documents whose ``expires_at`` has passed.

    A reaped collection drops everything rooted at that document. Backstop
    for the explicit logout purge: catches sessions that ended without a
    clean logout (tab close, JWT expiry, engine restart). Persistent rows
    (``expires_at`` null, the shape we use for org-shared docs) are never
    touched. Runs until cancelled by the lifespan teardown.
    """
    await _reap(documents)
    while True:
        await asyncio.sleep(interval_seconds)
        await _reap(documents)


async def _reap(documents: DocumentService) -> None:
    """One reaper iteration. Logs the deleted count on success and the full
    exception with traceback on failure; never re-raises non-cancel errors so
    a bad iteration doesn't kill the loop. ``asyncio.CancelledError`` is
    re-raised so the lifespan teardown can cancel the task cleanly.
    """
    try:
        deleted = await documents.reap_expired()
        if deleted:
            logger.info("Reaped %d expired document collection(s)", deleted)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Document reaper iteration failed; will retry on next interval")


def _load_startup_settings(fast_api: FastAPI) -> AppSettings:
    override = fast_api.dependency_overrides.get(load_settings)
    if override is not None:
        return override()
    return load_settings()


def _restore_cached_config(
    settings: AppSettings,
) -> tuple[AppSettings, Model | None, Model | None, EmbeddingService | None]:
    """Restore the last-applied pushed config from the encrypted on-disk cache.

    Returns the effective settings plus the pre-built smart/fast models and
    embedder to inject into the initial app state. Falls back to the env settings
    (all-None) when config push is disabled, no cache exists, or the cached config
    can't be applied (bad/unavailable model) - the cache never crashes boot.
    """
    if not settings.allow_config_push:
        return settings, None, None, None
    cached = load_config()
    if cached is None:
        return settings, None, None, None
    try:
        effective, smart_model, fast_model, embedder, notes = resolve_and_apply(settings, cached)
    except CONFIG_APPLY_ERRORS:
        logger.warning("Cached AI config could not be applied; falling back to env settings", exc_info=True)
        return settings, None, None, None
    logger.info(
        "Restored cached AI config: smart_model=%s fast_model=%s%s",
        effective.smart_model_name,
        effective.fast_model_name,
        f"; {'; '.join(notes)}" if notes else "",
    )
    return effective, smart_model, fast_model, embedder


@asynccontextmanager
async def lifespan(fast_api: FastAPI):
    # Load env vars on startup so we can immediately crash if required env vars aren't set
    settings = _load_startup_settings(fast_api)
    # Precedence: env < persisted cache < live push. Restore the last-applied pushed
    # config unless config push is disabled (then env is the single source of truth).
    effective, smart_model, fast_model, embedder = _restore_cached_config(settings)
    app_state = build_app_state(
        effective,
        fast_model=fast_model,
        smart_model=smart_model,
        embedder=embedder,
    )
    fast_api.state.settings = effective
    apply_app_state(fast_api.state, app_state)
    runtime = app_state.runtime
    tracer_provider = setup_posthog_tracking(effective)
    if tracer_provider:
        Agent.instrument_all(InstrumentationSettings(tracer_provider=tracer_provider))
    reaper_task = asyncio.create_task(
        _run_expired_doc_reaper(
            runtime.documents,
            interval_seconds=settings.documents_reaper_interval_seconds,
        ),
        name="expired-document-reaper",
    )
    yield
    reaper_task.cancel()
    try:
        await reaper_task
    except asyncio.CancelledError:
        pass
    await runtime.documents.close()
    if tracer_provider:
        tracer_provider.shutdown()


app = FastAPI(title="Stirling AI Engine", lifespan=lifespan, version="0.1.0")
app.add_middleware(UserIdMiddleware)
app.add_middleware(EngineSharedSecretMiddleware)
# Every router gets the same configurable identity gate; /health stays open
# for liveness probes. See enforce_required_user_id for the policy.
_user_gate = [Depends(enforce_required_user_id)]
app.include_router(orchestrator_router, dependencies=_user_gate)
app.include_router(pdf_edit_router, dependencies=_user_gate)
app.include_router(pdf_question_router, dependencies=_user_gate)
app.include_router(agent_draft_router, dependencies=_user_gate)
app.include_router(execution_router, dependencies=_user_gate)
app.include_router(document_router, dependencies=_user_gate)
app.include_router(ledger_router, dependencies=_user_gate)
app.include_router(pdf_comments_router, dependencies=_user_gate)
app.include_router(agent_capabilities_router, dependencies=_user_gate)
app.include_router(document_classifier_router, dependencies=_user_gate)
# Config push is a system/admin sync from the Java processor with no X-User-Id, so
# it is guarded by the X-Engine-Auth shared secret (global middleware) and the
# allow_config_push flag only, deliberately NOT the per-user identity gate.
app.include_router(config_router)


@app.get("/health", response_model=HealthResponse)
async def healthcheck(http_request: Request) -> HealthResponse:
    # Report the LIVE config (env < cache < push) held on app.state, not the
    # boot-time env cache, so an admin "Test connection" check shows the model
    # actually in use after a config push. Falls back to env if state isn't up yet.
    settings: AppSettings = getattr(http_request.app.state, "settings", None) or load_settings()
    return HealthResponse(
        status="ok",
        smart_model=settings.smart_model_name,
        fast_model=settings.fast_model_name,
    )
