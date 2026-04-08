from collections.abc import Iterator

import pytest

from stirling.config import AppSettings, load_settings
from stirling.contracts import (
    AgentExecutionRequest,
    AgentSpec,
    AgentSpecStep,
    EditPlanResponse,
    ExecutionContext,
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    ToolOperationStep,
)
from stirling.contracts.form_fill import (
    DetectedRole,
    FieldMapping,
    FormFillClarificationResponse,
    FormFillRequest,
    FormFillResultResponse,
    KnowledgeEntry,
    KnowledgeUpdateResponse,
    RoleConfirmationResponse,
    RoleDetectionResult,
)
from stirling.models.tool_models import OperationId, RotateParams


def test_orchestrator_request_accepts_user_message() -> None:
    request = OrchestratorRequest(user_message="Rotate the PDF")

    assert request.user_message == "Rotate the PDF"


def test_agent_execution_request_uses_typed_agent_spec() -> None:
    steps: list[AgentSpecStep] = [
        ToolOperationStep(
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
    steps = [ToolOperationStep(tool=OperationId.ROTATE, parameters=RotateParams(angle=90))]
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


def test_form_fill_request_serializes_to_camel_case() -> None:
    request = FormFillRequest(user_message="Fill this", knowledge={"name": "John"})
    data = request.model_dump(by_alias=True)

    assert "userMessage" in data
    assert "formFields" in data
    assert "extractedDocumentText" in data


def test_form_fill_result_response_discriminator() -> None:
    fill = FormFillResultResponse(
        filled_fields=[FieldMapping(field_name="name", knowledge_key="full_name", value="John")],
        message="Done.",
    )
    assert fill.outcome == "fill_result"

    update = KnowledgeUpdateResponse(
        proposed_entries=[KnowledgeEntry(key="name", value="John", source="CV")],
        message="Extracted.",
    )
    assert update.outcome == "knowledge_update"

    clarification = FormFillClarificationResponse(question="What?", reason="Missing info.")
    assert clarification.outcome == "form_fill_clarification"


def test_role_confirmation_response() -> None:
    confirmation = RoleConfirmationResponse(
        role_detection=RoleDetectionResult(
            detected_roles=[
                DetectedRole(role_label="Client", field_names=["name"], is_primary_person=True),
                DetectedRole(role_label="Beneficiary", field_names=["ben_name"], is_primary_person=False),
            ],
            primary_role_label="Client",
            primary_confidence=0.75,
            confidence_reasoning="Field prefixes.",
        ),
        suggested_primary="Client",
        question="Are you the Client?",
        provisional_fills=[FieldMapping(field_name="name", knowledge_key="full_name", value="John")],
    )
    assert confirmation.outcome == "role_confirmation_needed"
    assert confirmation.suggested_primary == "Client"
    assert len(confirmation.provisional_fills) == 1


def test_app_settings_accepts_model_configuration() -> None:
    settings = AppSettings(
        smart_model_name="claude-sonnet-4-5-20250929",
        fast_model_name="claude-haiku-4-5-20251001",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
    )

    assert settings.smart_model_name
    assert settings.fast_model_max_tokens == 2048
