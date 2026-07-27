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
from stirling.api.routes.config import CONFIG_APPLY_ERRORS, apply_to_app, resolve_and_apply
from stirling.config import AppSettings, load_settings
from stirling.config.config_cache import cache_stamp, load_config
from stirling.contracts import HealthResponse
from stirling.documents import DocumentService, EmbeddingService
from stirling.services import setup_posthog_tracking

logger = logging.getLogger(__name__)


# Seconds the lifespan waits for a background task to drain before cancelling it.
_BACKGROUND_TASK_DRAIN_SECONDS = 10


async def _sleep_until(stop: asyncio.Event, seconds: float) -> bool:
    """Wait up to ``seconds``; True if asked to stop, False if the interval elapsed."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        return False
    return True


async def _run_expired_doc_reaper(
    documents: DocumentService,
    interval_seconds: int,
    stop: asyncio.Event,
) -> None:
    """Backstop purge of documents past ``expires_at``; persistent (null expires_at) rows are never touched."""
    await _reap(documents)
    while not await _sleep_until(stop, interval_seconds):
        await _reap(documents)


async def _reap(documents: DocumentService) -> None:
    """One reaper iteration; swallows non-cancel errors so a bad iteration doesn't kill the loop."""
    try:
        deleted = await documents.reap_expired()
        if deleted:
            logger.info("Reaped %d expired document collection(s)", deleted)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Document reaper iteration failed; will retry on next interval")


def _adopt_cached_config_if_changed(fast_api: FastAPI) -> None:
    """Re-apply the persisted config when the shared cache file changed under us; never raises."""
    # Read the stamp before the payload: a write landing between the two re-applies next
    # tick, whereas the reverse order would record the newer stamp and skip forever.
    stamp = cache_stamp()
    if stamp is None or stamp == getattr(fast_api.state, "config_cache_stamp", None):
        return
    # Claim the stamp up front so a cache we cannot read or apply is not retried every tick.
    fast_api.state.config_cache_stamp = stamp
    cached = load_config()
    if cached is None:
        return
    try:
        effective, _ = apply_to_app(fast_api, cached)
    except CONFIG_APPLY_ERRORS:
        logger.warning("Config pushed to another worker could not be applied here", exc_info=True)
        return
    logger.info(
        "Adopted AI config pushed to another worker: smart_model=%s fast_model=%s",
        effective.smart_model_name,
        effective.fast_model_name,
    )


async def _run_config_cache_watcher(
    fast_api: FastAPI,
    interval_seconds: int,
    stop: asyncio.Event,
) -> None:
    """Poll the shared config cache so every worker converges on the last push."""
    while not await _sleep_until(stop, interval_seconds):
        try:
            _adopt_cached_config_if_changed(fast_api)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Config cache watcher iteration failed; will retry on next interval")


def _load_startup_settings(fast_api: FastAPI) -> AppSettings:
    override = fast_api.dependency_overrides.get(load_settings)
    if override is not None:
        return override()
    return load_settings()


def _restore_cached_config(
    settings: AppSettings,
) -> tuple[AppSettings, Model | None, Model | None, EmbeddingService | None]:
    """Restore the last-applied pushed config from the encrypted cache, or env settings on any failure."""
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
    # Precedence: env < persisted cache < live push. Stamp first so a push landing mid-boot
    # is re-adopted by the watcher rather than mistaken for the config we just restored.
    fast_api.state.config_cache_stamp = cache_stamp()
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
    stop_background = asyncio.Event()
    reaper_task = asyncio.create_task(
        _run_expired_doc_reaper(
            runtime.documents,
            interval_seconds=settings.documents_reaper_interval_seconds,
            stop=stop_background,
        ),
        name="expired-document-reaper",
    )
    background_tasks = [reaper_task]
    if effective.allow_config_push:
        # A push reaches only one uvicorn worker; this watcher is how the rest of the
        # pool picks it up, otherwise most requests keep running the previous models.
        background_tasks.append(
            asyncio.create_task(
                _run_config_cache_watcher(
                    fast_api,
                    interval_seconds=settings.config_cache_poll_interval_seconds,
                    stop=stop_background,
                ),
                name="config-cache-watcher",
            )
        )
    yield
    # Drain the loops rather than cancel: cancelling a reaper mid `to_thread` sqlite call lets
    # close() pull the connection out from under it and segfault sqlite-vec. Cancel is a backstop.
    stop_background.set()
    _, pending = await asyncio.wait(background_tasks, timeout=_BACKGROUND_TASK_DRAIN_SECONDS)
    for task in pending:
        logger.warning("Background task %s did not stop in time; cancelling", task.get_name())
        task.cancel()
        try:
            await task
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
# Config push is a system sync with no X-User-Id, so it is guarded by the shared secret
# and allow_config_push flag only, deliberately NOT the per-user identity gate.
app.include_router(config_router)


@app.get("/health", response_model=HealthResponse)
async def healthcheck(http_request: Request) -> HealthResponse:
    # Report the LIVE config on app.state, not the boot-time env cache, so an admin
    # "Test connection" shows the model actually in use after a push. Falls back to env.
    settings: AppSettings = getattr(http_request.app.state, "settings", None) or load_settings()
    return HealthResponse(
        status="ok",
        smart_model=settings.smart_model_name,
        fast_model=settings.fast_model_name,
    )
