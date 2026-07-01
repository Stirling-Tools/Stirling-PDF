"""Assemble the runtime + agents into one bundle, swapped onto app.state atomically to change models at runtime."""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Any

from pydantic_ai.models import Model

from stirling.agents import (
    AgentDescriptor,
    DocumentClassifierAgent,
    ExecutionPlanningAgent,
    OrchestratorAgent,
    PdfCreateAgent,
    PdfEditAgent,
    PdfQuestionAgent,
    PdfReviewAgent,
    UserSpecAgent,
    build_descriptors,
)
from stirling.agents.ledger import MathAuditorAgent
from stirling.agents.pdf_comment import PdfCommentAgent
from stirling.config import AppSettings
from stirling.documents import DocumentService, EmbeddingService
from stirling.services import AppRuntime, build_runtime


@dataclass(frozen=True)
class AppState:
    """Every object the lifespan assigns onto ``fast_api.state``."""

    runtime: AppRuntime
    orchestrator_agent: OrchestratorAgent
    pdf_edit_agent: PdfEditAgent
    pdf_question_agent: PdfQuestionAgent
    user_spec_agent: UserSpecAgent
    execution_planning_agent: ExecutionPlanningAgent
    math_auditor_agent: MathAuditorAgent
    pdf_comment_agent: PdfCommentAgent
    document_classifier_agent: DocumentClassifierAgent
    # One descriptor list drives both orchestrator routing and the MCP manifest.
    agent_descriptors: list[AgentDescriptor]


def build_app_state(
    settings: AppSettings,
    *,
    documents: DocumentService | None = None,
    fast_model: Model | None = None,
    smart_model: Model | None = None,
    embedder: EmbeddingService | None = None,
) -> AppState:
    """Build the runtime and every agent from ``settings``."""
    runtime = build_runtime(
        settings,
        documents=documents,
        fast_model=fast_model,
        smart_model=smart_model,
        embedder=embedder,
    )
    pdf_edit_agent = PdfEditAgent(runtime)
    pdf_question_agent = PdfQuestionAgent(runtime)
    user_spec_agent = UserSpecAgent(runtime)
    pdf_review_agent = PdfReviewAgent(runtime)
    pdf_create_agent = PdfCreateAgent(runtime)
    execution_planning_agent = ExecutionPlanningAgent(runtime)
    math_auditor_agent = MathAuditorAgent(runtime)
    pdf_comment_agent = PdfCommentAgent(runtime)
    agent_descriptors = build_descriptors(
        [
            pdf_edit_agent,
            pdf_question_agent,
            user_spec_agent,
            pdf_review_agent,
            pdf_create_agent,
            pdf_comment_agent,
            math_auditor_agent,
            execution_planning_agent,
        ]
    )
    return AppState(
        runtime=runtime,
        orchestrator_agent=OrchestratorAgent(runtime, agent_descriptors),
        pdf_edit_agent=pdf_edit_agent,
        pdf_question_agent=pdf_question_agent,
        user_spec_agent=user_spec_agent,
        execution_planning_agent=execution_planning_agent,
        math_auditor_agent=math_auditor_agent,
        pdf_comment_agent=pdf_comment_agent,
        document_classifier_agent=DocumentClassifierAgent(runtime),
        agent_descriptors=agent_descriptors,
    )


def apply_app_state(state: Any, app_state: AppState) -> None:
    """Copy every field of ``app_state`` onto a Starlette ``app.state`` object."""
    for field in fields(app_state):
        setattr(state, field.name, getattr(app_state, field.name))
