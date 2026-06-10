from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from stirling.agents import (
    ExecutionPlanningAgent,
    OrchestratorAgent,
    PdfEditAgent,
    PdfQuestionAgent,
    UserSpecAgent,
)
from stirling.agents.ledger import MathAuditorAgent
from stirling.agents.pdf_comment import PdfCommentAgent
from stirling.config import AppSettings, load_settings
from stirling.documents import DocumentService
from stirling.models import UserId
from stirling.services import AppRuntime, current_user_id


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


def get_document_service(request: Request) -> DocumentService:
    return request.app.state.runtime.documents


def get_math_auditor_agent(request: Request) -> MathAuditorAgent:
    return request.app.state.math_auditor_agent


def get_pdf_comment_agent(request: Request) -> PdfCommentAgent:
    return request.app.state.pdf_comment_agent


def require_user_id() -> UserId:
    """FastAPI dependency for routes that touch per-user storage.

    Reads ``X-User-Id`` (already extracted into a ContextVar by ``UserIdMiddleware``)
    and returns it. Returns HTTP 401 if the caller didn't supply the header. Apply
    to any route that ingests, searches, reads, or deletes document content so
    the tenancy gate is enforced at the API boundary.
    """
    user_id = current_user_id.get()
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-User-Id header is required",
        )
    return user_id


def enforce_required_user_id(
    settings: Annotated[AppSettings, Depends(load_settings)],
) -> None:
    """Router-level boundary gate, applied uniformly to every router."""
    if not settings.require_user_id:
        return
    if current_user_id.get() is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-User-Id header is required",
        )
