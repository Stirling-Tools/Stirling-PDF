from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.agents import UserSpecAgent
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentRevisionRequest,
    ConversationMessage,
    EditClarificationRequest,
    EditPlanResponse,
    ToolOperationStep,
)
from stirling.models.tool_models import CompressParams, OperationId, RotateParams
from stirling.services.runtime import AppRuntime


class StubUserSpecAgent(UserSpecAgent):
    def __init__(self, runtime: AppRuntime, draft_result: AgentDraft, revision_result: AgentDraft) -> None:
        super().__init__(runtime)
        self.draft_result = draft_result
        self.revision_result = revision_result
        self.edit_plan = EditPlanResponse(
            summary="Rotate the document.",
            steps=[
                ToolOperationStep(
                    tool=OperationId.ROTATE,
                    parameters=RotateParams(angle=90),
                )
            ],
        )

    async def _build_edit_plan(self, user_message: str) -> EditPlanResponse:
        return self.edit_plan

    async def _run_draft_agent(self, request: AgentDraftRequest, edit_plan: EditPlanResponse) -> AgentDraft:
        return self.draft_result

    async def _run_revision_agent(self, request: AgentRevisionRequest, edit_plan: EditPlanResponse) -> AgentDraft:
        return self.revision_result


class ClarifyingUserSpecAgent(UserSpecAgent):
    def __init__(self, runtime: AppRuntime) -> None:
        super().__init__(runtime)

    async def _build_edit_plan(self, user_message: str) -> EditClarificationRequest:
        return EditClarificationRequest(
            question="Which pages should be changed?",
            reason="The request does not specify the target pages.",
        )


@pytest.mark.anyio
async def test_user_spec_agent_drafts_agent_spec(runtime: AppRuntime) -> None:
    agent = StubUserSpecAgent(
        runtime,
        AgentDraft(
            name="Invoice Cleanup",
            description="Prepare invoices for review.",
            objective="Normalize invoices before accounting review.",
            steps=[
                ToolOperationStep(
                    tool=OperationId.ROTATE,
                    parameters=RotateParams(angle=90),
                )
            ],
        ),
        revision_result=AgentDraft(
            name="Unused",
            description="Unused",
            objective="Unused",
            steps=[],
        ),
    )

    response = await agent.draft(
        AgentDraftRequest(
            user_message="Build me an invoice cleanup agent.",
            conversation_history=[
                ConversationMessage(role="user", content="It should handle scanned PDFs."),
            ],
        )
    )

    assert response.outcome == "draft"
    assert response.draft.name == "Invoice Cleanup"
    assert response.draft.steps[0].kind == "tool"


@pytest.mark.anyio
async def test_user_spec_agent_revises_existing_draft(runtime: AppRuntime) -> None:
    current_draft = AgentDraft(
        name="Invoice Cleanup",
        description="Prepare invoices for review.",
        objective="Normalize invoices before accounting review.",
        steps=[
            ToolOperationStep(
                tool=OperationId.ROTATE,
                parameters=RotateParams(angle=90),
            )
        ],
    )
    agent = StubUserSpecAgent(
        runtime,
        draft_result=current_draft,
        revision_result=AgentDraft(
            name="Invoice Cleanup",
            description="Prepare invoices for review and reduce file size.",
            objective="Normalize invoices before accounting review.",
            steps=[
                ToolOperationStep(
                    tool=OperationId.ROTATE,
                    parameters=RotateParams(angle=90),
                ),
                ToolOperationStep(
                    tool=OperationId.COMPRESS,
                    parameters=CompressParams(compression_level=5),
                ),
            ],
        ),
    )

    response = await agent.revise(
        AgentRevisionRequest(
            user_message="Also compress the files before upload.",
            current_draft=current_draft,
        )
    )

    assert response.outcome == "draft"
    assert len(response.draft.steps) == 2
    assert response.draft.steps[1].kind == "tool"


def test_tool_operation_step_rejects_mismatched_parameters() -> None:
    with pytest.raises(ValidationError):
        ToolOperationStep(
            tool=OperationId.ROTATE,
            parameters=CompressParams(compression_level=5),
        )


@pytest.mark.anyio
async def test_user_spec_agent_propagates_edit_clarification(runtime: AppRuntime) -> None:
    agent = ClarifyingUserSpecAgent(runtime)

    response = await agent.draft(AgentDraftRequest(user_message="Build an agent to rotate some pages."))

    assert isinstance(response, EditClarificationRequest)
