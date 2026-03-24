from __future__ import annotations

from stirling.services.capabilities import (
    AgentDraftService,
    AgentExecutionPlanningService,
    OrchestratorService,
    PdfEditService,
    PdfQuestionService,
)


def get_orchestrator_service() -> OrchestratorService:
    return OrchestratorService()


def get_pdf_edit_service() -> PdfEditService:
    return PdfEditService()


def get_pdf_question_service() -> PdfQuestionService:
    return PdfQuestionService()


def get_agent_draft_service() -> AgentDraftService:
    return AgentDraftService()


def get_agent_execution_planning_service() -> AgentExecutionPlanningService:
    return AgentExecutionPlanningService()
