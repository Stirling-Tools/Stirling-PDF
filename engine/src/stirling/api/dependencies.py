from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from stirling.agents.execution import ExecutionPlanningAgent
from stirling.agents.orchestrator import OrchestratorAgent
from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.user_spec import UserSpecAgent
from stirling.config.settings import AppSettings, load_settings
from stirling.services.runtime import AppRuntime, build_runtime


def get_runtime(settings: AppSettings) -> AppRuntime:
    return build_runtime(settings)


def get_orchestrator_agent(settings: Annotated[AppSettings, Depends(load_settings)]) -> OrchestratorAgent:
    return OrchestratorAgent(get_runtime(settings))


def get_pdf_edit_agent(settings: Annotated[AppSettings, Depends(load_settings)]) -> PdfEditAgent:
    return PdfEditAgent(get_runtime(settings))


def get_pdf_question_agent(settings: Annotated[AppSettings, Depends(load_settings)]) -> PdfQuestionAgent:
    return PdfQuestionAgent(get_runtime(settings))


def get_user_spec_agent(settings: Annotated[AppSettings, Depends(load_settings)]) -> UserSpecAgent:
    return UserSpecAgent(get_runtime(settings))


def get_execution_planning_agent(
    settings: Annotated[AppSettings, Depends(load_settings)],
) -> ExecutionPlanningAgent:
    return ExecutionPlanningAgent(get_runtime(settings))
