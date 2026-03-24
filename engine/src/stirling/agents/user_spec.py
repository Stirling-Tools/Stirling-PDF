from __future__ import annotations

from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentRevisionRequest,
    AgentRevisionResponse,
)
from stirling.services.runtime import AppRuntime


class UserSpecAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

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
