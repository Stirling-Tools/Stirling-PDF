from stirling.config import AppSettings
from stirling.contracts import (
    AgentExecutionRequest,
    AgentSpec,
    AgentSpecStep,
    EditPlanResponse,
    ExecutionContext,
    ExtractedFileText,
    ExtractedTextArtifact,
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    PdfTextSelection,
    ToolOperationStep,
)
from stirling.models.tool_models import Angle, RotatePdfParams, ToolEndpoint


def test_orchestrator_request_accepts_user_message() -> None:
    request = OrchestratorRequest(
        user_message="Rotate the PDF",
        file_names=["test.pdf"],
        artifacts=[
            ExtractedTextArtifact(
                files=[
                    ExtractedFileText(
                        file_name="test.pdf",
                        pages=[PdfTextSelection(page_number=1, text="Hello")],
                    )
                ]
            )
        ],
    )

    assert request.user_message == "Rotate the PDF"
    assert len(request.artifacts) == 1


def test_agent_execution_request_uses_typed_agent_spec() -> None:
    steps: list[AgentSpecStep] = [
        ToolOperationStep(
            tool=ToolEndpoint.ROTATE_PDF,
            parameters=RotatePdfParams(angle=Angle(90)),
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
    steps = [ToolOperationStep(tool=ToolEndpoint.ROTATE_PDF, parameters=RotatePdfParams(angle=Angle(90)))]
    response = EditPlanResponse(
        summary="Rotate the input PDF by 90 degrees.",
        steps=steps,
    )

    assert response.steps[0].tool == ToolEndpoint.ROTATE_PDF


def test_pdf_question_answer_defaults_evidence_list() -> None:
    response = PdfQuestionAnswerResponse(answer="The invoice total is 120.00")

    assert response.evidence == []


def test_app_settings_accepts_model_configuration() -> None:
    from pathlib import Path

    from stirling.config import RagBackend

    settings = AppSettings(
        smart_model_name="claude-sonnet-4-5-20250929",
        fast_model_name="claude-haiku-4-5-20251001",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        rag_backend=RagBackend.SQLITE,
        rag_embedding_model="voyageai:voyage-4",
        rag_store_path=Path(":memory:"),
        rag_pgvector_dsn="",
        rag_chunk_size=512,
        rag_chunk_overlap=64,
        rag_default_top_k=5,
        posthog_enabled=False,
        posthog_api_key="",
        posthog_host="https://eu.i.posthog.com",
    )

    assert settings.smart_model_name
    assert settings.fast_model_max_tokens == 2048
