from __future__ import annotations

from fastapi import Request

from stirling.agents import ExecutionPlanningAgent, OrchestratorAgent, PdfEditAgent, PdfQuestionAgent, UserSpecAgent
from stirling.services import AppRuntime, TrackingService


def get_runtime(request: Request) -> AppRuntime:
    return request.app.state.runtime


def get_orchestrator_agent(request: Request) -> OrchestratorAgent:
    return request.app.state.orchestrator_agent


def get_pdf_edit_agent(request: Request) -> PdfEditAgent:
    return request.app.state.pdf_edit_agent


def get_pdf_question_agent(request: Request) -> PdfQuestionAgent:
    return request.app.state.pdf_question_agent


def get_user_spec_agent(request: Request) -> UserSpecAgent:
    return request.app.state.user_spec_agent


def get_execution_planning_agent(request: Request) -> ExecutionPlanningAgent:
    return request.app.state.execution_planning_agent


def get_tracking(request: Request) -> TrackingService:
    return request.app.state.tracking
