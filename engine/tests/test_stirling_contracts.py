from collections.abc import Iterator

import pytest

from stirling.config.settings import AppSettings, load_settings
from stirling.contracts import (
    AgentExecutionRequest,
    AgentSpecStep,
    EditOperationPlanStep,
    EditPlanResponse,
    ExecutionContext,
    OrchestratorRequest,
    SupportedCapability,
    ToolAgentStep,
)
from stirling.contracts.agent_specs import AgentSpec
from stirling.contracts.pdf_questions import PdfQuestionAnswerResponse
from stirling.models.tool_models import OperationId, RotateParams
from stirling.services.model_registry import ModelRegistry


def test_orchestrator_request_accepts_supported_capability() -> None:
    request = OrchestratorRequest(capability=SupportedCapability.PDF_EDIT, user_message="Rotate the PDF")

    assert request.capability == SupportedCapability.PDF_EDIT


def test_agent_execution_request_uses_typed_agent_spec() -> None:
    steps: list[AgentSpecStep] = [
        ToolAgentStep(
            title="Rotate scans",
            description="Rotate pages into portrait orientation",
            tool=OperationId.ROTATE,
            parameters=RotateParams(angle=90),
        )
    ]
    request = AgentExecutionRequest(
        agent_spec=AgentSpec(
            name="Invoice cleanup",
            description="Normalise inbound invoices",
            objective="Prepare uploads for accounting review",
            steps=steps,
        ),
        current_step_index=0,
        execution_context=ExecutionContext(input_files=["invoice.pdf"]),
    )

    assert request.agent_spec.steps[0].kind == "tool"


def test_edit_plan_response_has_typed_steps() -> None:
    steps = [EditOperationPlanStep(tool=OperationId.ROTATE, parameters=RotateParams(angle=90))]
    response = EditPlanResponse(
        summary="Rotate the input PDF by 90 degrees.",
        steps=steps,
    )

    assert response.steps[0].tool == OperationId.ROTATE


def test_pdf_question_answer_defaults_evidence_list() -> None:
    response = PdfQuestionAnswerResponse(answer="The invoice total is 120.00")

    assert response.evidence == []


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    load_settings.cache_clear()
    yield
    load_settings.cache_clear()


def test_model_registry_builds_from_settings() -> None:
    settings = AppSettings(
        anthropic_api_key="",
        openai_api_key="",
        openai_base_url=None,
        smart_model_name="claude-sonnet-4-5-20250929",
        fast_model_name="claude-haiku-4-5-20251001",
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
    registry = ModelRegistry.from_settings(settings)

    assert registry.smart.name
    assert registry.fast.provider.value
