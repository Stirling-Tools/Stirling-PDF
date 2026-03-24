from fastapi.testclient import TestClient

from stirling.api.app import app
from stirling.api.dependencies import (
    get_agent_draft_service,
    get_agent_execution_planning_service,
    get_orchestrator_service,
    get_pdf_edit_service,
    get_pdf_question_service,
)
from stirling.config.settings import AppSettings, load_settings
from stirling.contracts import (
    AgentDraft,
    AgentDraftResponse,
    CannotContinueExecutionAction,
    EditCannotDoResponse,
    PdfQuestionNotFoundResponse,
    UnsupportedCapabilityResponse,
)
from stirling.models.tool_models import RotateParams
from stirling.services.capabilities import (
    AgentDraftService,
    AgentExecutionPlanningService,
    OrchestratorService,
    PdfEditService,
    PdfQuestionService,
)


class TestSettingsProvider:
    def __call__(self) -> AppSettings:
        return AppSettings(
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


class TestOrchestratorService(OrchestratorService):
    async def handle(self, request):  # type: ignore[override]
        return UnsupportedCapabilityResponse(capability=request.capability or "unknown", message=request.user_message)


class TestPdfEditService(PdfEditService):
    async def handle(self, request):  # type: ignore[override]
        return EditCannotDoResponse(reason=request.user_message)


class TestPdfQuestionService(PdfQuestionService):
    async def handle(self, request):  # type: ignore[override]
        return PdfQuestionNotFoundResponse(reason=request.question)


class TestAgentDraftService(AgentDraftService):
    async def draft(self, request):  # type: ignore[override]
        return AgentDraftResponse(
            draft=AgentDraft(
                name="Drafted",
                description="Route wiring test",
                objective=request.user_message,
                steps=[],
            )
        )


class TestExecutionPlanningService(AgentExecutionPlanningService):
    async def next_action(self, request):  # type: ignore[override]
        return CannotContinueExecutionAction(reason=str(request.current_step_index))


client = TestClient(app)


def override_settings() -> AppSettings:
    return TestSettingsProvider()()


def override_orchestrator_service() -> OrchestratorService:
    return TestOrchestratorService()


def override_pdf_edit_service() -> PdfEditService:
    return TestPdfEditService()


def override_pdf_question_service() -> PdfQuestionService:
    return TestPdfQuestionService()


def override_agent_draft_service() -> AgentDraftService:
    return TestAgentDraftService()


def override_execution_service() -> AgentExecutionPlanningService:
    return TestExecutionPlanningService()


app.dependency_overrides[load_settings] = override_settings
app.dependency_overrides[get_orchestrator_service] = override_orchestrator_service
app.dependency_overrides[get_pdf_edit_service] = override_pdf_edit_service
app.dependency_overrides[get_pdf_question_service] = override_pdf_question_service
app.dependency_overrides[get_agent_draft_service] = override_agent_draft_service
app.dependency_overrides[get_agent_execution_planning_service] = override_execution_service


def test_health_route() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_orchestrator_route() -> None:
    response = client.post("/api/v1/orchestrator", json={"capability": "pdf_edit", "userMessage": "route this"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "unsupported_capability"


def test_pdf_edit_route() -> None:
    response = client.post("/api/v1/pdf/edit", json={"userMessage": "rotate this"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "cannot_do"


def test_pdf_questions_route() -> None:
    response = client.post("/api/v1/pdf/questions", json={"question": "what is this?"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "not_found"


def test_agent_draft_route() -> None:
    response = client.post("/api/v1/agents/draft", json={"userMessage": "build me an agent"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "draft"


def test_agent_revise_route() -> None:
    response = client.post(
        "/api/v1/agents/revise",
        json={
            "userMessage": "revise it",
            "currentDraft": {
                "name": "Drafted",
                "description": "Route wiring test",
                "objective": "build me an agent",
                "steps": [
                    {
                        "kind": "tool",
                        "title": "Rotate scans",
                        "description": "Rotate pages",
                        "tool": "rotate",
                        "parameters": RotateParams(angle=90).model_dump(by_alias=True),
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "draft"


def test_next_action_route() -> None:
    response = client.post(
        "/api/v1/agents/next-action",
        json={
            "agentSpec": {
                "name": "Drafted",
                "description": "Route wiring test",
                "objective": "build me an agent",
                "steps": [
                    {
                        "kind": "tool",
                        "title": "Rotate scans",
                        "description": "Rotate pages",
                        "tool": "rotate",
                        "parameters": RotateParams(angle=90).model_dump(by_alias=True),
                    }
                ],
            },
            "currentStepIndex": 0,
            "executionContext": {"inputFiles": ["input.pdf"], "metadata": {}},
        },
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "cannot_continue"
