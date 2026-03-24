from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI

from stirling.api.routes import (
    agent_draft_router,
    execution_router,
    orchestrator_router,
    pdf_edit_router,
    pdf_question_router,
)
from stirling.config.settings import AppSettings, load_settings
from stirling.contracts import HealthResponse
from stirling.services.model_registry import ModelRegistry

app = FastAPI(title="Stirling AI Engine", version="0.1.0")
app.include_router(orchestrator_router)
app.include_router(pdf_edit_router)
app.include_router(pdf_question_router)
app.include_router(agent_draft_router)
app.include_router(execution_router)


@app.get("/health", response_model=HealthResponse)
async def healthcheck(settings: Annotated[AppSettings, Depends(load_settings)]) -> HealthResponse:
    model_registry = ModelRegistry.from_settings(settings)
    return HealthResponse(
        status="ok",
        smart_model=model_registry.smart.name,
        fast_model=model_registry.fast.name,
    )
