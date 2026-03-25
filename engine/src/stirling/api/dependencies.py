from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from stirling.agents.execution import ExecutionPlanningAgent
from stirling.agents.orchestrator import OrchestratorAgent
from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.user_spec import UserSpecAgent
from stirling.services.runtime import AppRuntime


def get_runtime(request: Request) -> AppRuntime:
    return request.app.state.runtime


def get_orchestrator_agent(runtime: Annotated[AppRuntime, Depends(get_runtime)]) -> OrchestratorAgent:
    return OrchestratorAgent(runtime)


def get_pdf_edit_agent(runtime: Annotated[AppRuntime, Depends(get_runtime)]) -> PdfEditAgent:
    return PdfEditAgent(runtime)


def get_pdf_question_agent(runtime: Annotated[AppRuntime, Depends(get_runtime)]) -> PdfQuestionAgent:
    return PdfQuestionAgent(runtime)


def get_user_spec_agent(runtime: Annotated[AppRuntime, Depends(get_runtime)]) -> UserSpecAgent:
    return UserSpecAgent(runtime)


def get_execution_planning_agent(
    runtime: Annotated[AppRuntime, Depends(get_runtime)],
) -> ExecutionPlanningAgent:
    return ExecutionPlanningAgent(runtime)
