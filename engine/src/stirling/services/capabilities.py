from __future__ import annotations

from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentExecutionRequest,
    AgentRevisionRequest,
    AgentRevisionResponse,
    CannotContinueExecutionAction,
    EditCannotDoResponse,
    NextExecutionAction,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfEditRequest,
    PdfEditResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    UnsupportedCapabilityResponse,
)


class OrchestratorService:
    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        capability = request.capability.value if request.capability else "unknown"
        return UnsupportedCapabilityResponse(
            capability=capability,
            message="Orchestrator routing is not implemented yet.",
        )


class PdfEditService:
    async def handle(self, request: PdfEditRequest) -> PdfEditResponse:
        return EditCannotDoResponse(reason=f"PDF edit handling is not implemented yet for: {request.user_message}")


class PdfQuestionService:
    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        return PdfQuestionNotFoundResponse(
            reason=f"PDF question handling is not implemented yet for: {request.question}"
        )


class AgentDraftService:
    async def draft(self, request: AgentDraftRequest) -> AgentDraftResponse:
        return AgentDraftResponse(
            draft=AgentDraft(
                name="Untitled Agent",
                description="Drafting flow is not implemented yet.",
                objective=request.user_message,
                steps=[],
            )
        )

    async def revise(self, request: AgentRevisionRequest) -> AgentRevisionResponse:
        return AgentRevisionResponse(draft=request.current_draft)


class AgentExecutionPlanningService:
    async def next_action(self, request: AgentExecutionRequest) -> NextExecutionAction:
        return CannotContinueExecutionAction(
            reason=f"Execution planning is not implemented yet for step {request.current_step_index}."
        )
