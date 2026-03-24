from __future__ import annotations

import pytest
from pydantic import ValidationError

from stirling.agents.user_spec import UserSpecAgent
from stirling.config.settings import AppSettings
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentRevisionRequest,
    ToolAgentStep,
    ToolOperationStep,
)
from stirling.contracts.common import ConversationMessage
from stirling.models.tool_models import CompressParams, OperationId, RotateParams
from stirling.services.runtime import build_runtime


def build_test_settings() -> AppSettings:
    return AppSettings(
        anthropic_api_key="",
        openai_api_key="",
        openai_base_url=None,
        smart_model_name="test",
        fast_model_name="test",
        smart_model_reasoning_effort="medium",
        fast_model_reasoning_effort="minimal",
        smart_model_text_verbosity="medium",
        fast_model_text_verbosity="low",
        ai_max_tokens=None,
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        claude_max_tokens=4096,
        default_model_max_tokens=4096,
        posthog_api_key="",
        posthog_host="https://eu.i.posthog.com",
        java_backend_url="http://localhost:8080",
        java_backend_api_key="test-key",
        java_request_timeout_seconds=30,
        raw_debug=False,
        flask_debug=False,
        log_path=None,
        pdf_editor_table_debug=False,
        pdf_tauri_mode=False,
        ai_streaming=True,
        ai_preview_max_inflight=3,
        ai_request_timeout=70,
    )


class StubUserSpecAgent(UserSpecAgent):
    def __init__(self, draft_result: AgentDraft, revision_result: AgentDraft) -> None:
        super().__init__(build_runtime(build_test_settings()))
        self.draft_result = draft_result
        self.revision_result = revision_result

    async def _run_draft_agent(self, request: AgentDraftRequest) -> AgentDraft:
        return self.draft_result

    async def _run_revision_agent(self, request: AgentRevisionRequest) -> AgentDraft:
        return self.revision_result


@pytest.mark.anyio
async def test_user_spec_agent_drafts_agent_spec() -> None:
    agent = StubUserSpecAgent(
        AgentDraft(
            name="Invoice Cleanup",
            description="Prepare invoices for review.",
            objective="Normalize invoices before accounting review.",
            steps=[
                ToolAgentStep(
                    title="Rotate scans",
                    description="Rotate pages into portrait orientation.",
                    tool_step=ToolOperationStep(
                        tool=OperationId.ROTATE,
                        parameters=RotateParams(angle=90),
                    ),
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
async def test_user_spec_agent_revises_existing_draft() -> None:
    current_draft = AgentDraft(
        name="Invoice Cleanup",
        description="Prepare invoices for review.",
        objective="Normalize invoices before accounting review.",
        steps=[
            ToolAgentStep(
                title="Rotate scans",
                description="Rotate pages into portrait orientation.",
                tool_step=ToolOperationStep(
                    tool=OperationId.ROTATE,
                    parameters=RotateParams(angle=90),
                ),
            )
        ],
    )
    agent = StubUserSpecAgent(
        draft_result=current_draft,
        revision_result=AgentDraft(
            name="Invoice Cleanup",
            description="Prepare invoices for review and reduce file size.",
            objective="Normalize invoices before accounting review.",
            steps=[
                ToolAgentStep(
                    title="Rotate scans",
                    description="Rotate pages into portrait orientation.",
                    tool_step=ToolOperationStep(
                        tool=OperationId.ROTATE,
                        parameters=RotateParams(angle=90),
                    ),
                ),
                ToolAgentStep(
                    title="Compress files",
                    description="Reduce file size before upload.",
                    tool_step=ToolOperationStep(
                        tool=OperationId.COMPRESS,
                        parameters=CompressParams(compression_level=5),
                    ),
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


def test_tool_agent_step_rejects_mismatched_parameters() -> None:
    with pytest.raises(ValidationError):
        ToolAgentStep(
            title="Rotate scans",
            description="Rotate pages into portrait orientation.",
            tool_step=ToolOperationStep(
                tool=OperationId.ROTATE,
                parameters=CompressParams(compression_level=5),
            ),
        )
