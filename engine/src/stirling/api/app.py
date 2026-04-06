from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI

from stirling.agents import ExecutionPlanningAgent, OrchestratorAgent, PdfEditAgent, PdfQuestionAgent, UserSpecAgent
from stirling.agents.chat_agents import (
    AutoRedactAgent,
    DocSummaryAgent,
    StreamingOrchestrator,
)
from stirling.agents.registry import AgentMeta, AgentRegistry
from stirling.api.routes import (
    agent_draft_router,
    execution_router,
    orchestrator_router,
    pdf_edit_router,
    pdf_question_router,
)
from stirling.api.routes.chat import router as chat_router
from stirling.config import AppSettings, load_settings
from stirling.contracts import HealthResponse
from stirling.services import build_runtime


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

    # Chat agent registry
    registry = AgentRegistry()
    registry.register(AgentMeta(
        agent_id="doc_summary",
        name="Document Summary",
        description="Summarize a PDF document, extracting key points and main topics.",
        category="analysis",
        agent_factory=DocSummaryAgent,
    ))
    registry.register(AgentMeta(
        agent_id="auto_redact",
        name="Auto Redact",
        description="Detect sensitive information (PII, SSN, financial data) and auto-redact it.",
        category="security",
        agent_factory=AutoRedactAgent,
    ))
    fast_api.state.agent_registry = registry
    fast_api.state.streaming_orchestrator = StreamingOrchestrator(runtime, registry)
    yield


app = FastAPI(title="Stirling AI Engine", lifespan=lifespan, version="0.1.0")
app.include_router(orchestrator_router)
app.include_router(pdf_edit_router)
app.include_router(pdf_question_router)
app.include_router(agent_draft_router)
app.include_router(execution_router)
app.include_router(chat_router)


@app.get("/health", response_model=HealthResponse)
async def healthcheck(settings: Annotated[AppSettings, Depends(load_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        smart_model=settings.smart_model_name,
        fast_model=settings.fast_model_name,
    )
