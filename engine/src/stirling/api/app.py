from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI
from pydantic_ai import Agent
from pydantic_ai.models.instrumented import InstrumentationSettings

from stirling.agents import (
    ExecutionPlanningAgent,
    OrchestratorAgent,
    PdfEditAgent,
    PdfQuestionAgent,
    UserSpecAgent,
)
from stirling.agents.ledger import MathAuditorAgent
from stirling.agents.pdf_comment import PdfCommentAgent
from stirling.api.middleware import UserIdMiddleware
from stirling.api.routes import (
    agent_draft_router,
    document_router,
    execution_router,
    ledger_router,
    orchestrator_router,
    pdf_comments_router,
    pdf_edit_router,
    pdf_question_router,
)
from stirling.config import AppSettings, load_settings
from stirling.contracts import HealthResponse
from stirling.documents import DocumentService
from stirling.services import build_runtime, setup_posthog_tracking

logger = logging.getLogger(__name__)


async def _run_stale_doc_reaper(
    documents: DocumentService,
    interval_seconds: int,
    max_age_seconds: int,
) -> None:
    """Periodically delete RAG content older than ``max_age_seconds``.

    Backstop for the explicit logout purge. Catches sessions that ended
    without a clean logout (tab close, JWT expiry, engine restart). Runs
    until cancelled by the lifespan teardown.
    """
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            deleted = await documents.reap_stale(max_age_seconds)
            if deleted:
                logger.info(
                    "Reaped %d stale RAG collection(s) older than %ds",
                    deleted,
                    max_age_seconds,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            # One bad iteration must not kill the reaper. Log and keep going.
            logger.exception("RAG reaper iteration failed; will retry on next interval")


def _load_startup_settings(fast_api: FastAPI) -> AppSettings:
    override = fast_api.dependency_overrides.get(load_settings)
    if override is not None:
        return override()
    return load_settings()


@asynccontextmanager
async def lifespan(fast_api: FastAPI):
    # Load env vars on startup so we can immediately crash if required env vars aren't set
    settings = _load_startup_settings(fast_api)
    runtime = build_runtime(settings)
    fast_api.state.settings = settings
    fast_api.state.runtime = runtime
    fast_api.state.orchestrator_agent = OrchestratorAgent(runtime)
    fast_api.state.pdf_edit_agent = PdfEditAgent(runtime)
    fast_api.state.pdf_question_agent = PdfQuestionAgent(runtime)
    fast_api.state.user_spec_agent = UserSpecAgent(runtime)
    fast_api.state.execution_planning_agent = ExecutionPlanningAgent(runtime)
    fast_api.state.math_auditor_agent = MathAuditorAgent(runtime)
    fast_api.state.pdf_comment_agent = PdfCommentAgent(runtime)
    tracer_provider = setup_posthog_tracking(settings)
    if tracer_provider:
        Agent.instrument_all(InstrumentationSettings(tracer_provider=tracer_provider))
    reaper_task = asyncio.create_task(
        _run_stale_doc_reaper(
            runtime.documents,
            interval_seconds=settings.rag_reaper_interval_seconds,
            max_age_seconds=settings.rag_max_age_seconds,
        ),
        name="rag-stale-doc-reaper",
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
app.include_router(orchestrator_router)
app.include_router(pdf_edit_router)
app.include_router(pdf_question_router)
app.include_router(agent_draft_router)
app.include_router(execution_router)
app.include_router(document_router)
app.include_router(ledger_router)
app.include_router(pdf_comments_router)


@app.get("/health", response_model=HealthResponse)
async def healthcheck(settings: Annotated[AppSettings, Depends(load_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        smart_model=settings.smart_model_name,
        fast_model=settings.fast_model_name,
    )
