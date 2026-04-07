from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import (
    get_execution_planning_agent,
    get_orchestrator_agent,
    get_pdf_edit_agent,
    get_pdf_question_agent,
    get_user_spec_agent,
)
from stirling.config import AppSettings, load_settings
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentExecutionRequest,
    AgentRevisionRequest,
    AgentRevisionResponse,
    CannotContinueExecutionAction,
    EditCannotDoResponse,
    OrchestratorRequest,
    PdfEditRequest,
    PdfQuestionNeedContentResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
)
from stirling.models.tool_models import RotateParams


class StubSettingsProvider:
    def __call__(self) -> AppSettings:
        return AppSettings(
            smart_model_name="test",
            fast_model_name="test",
            smart_model_max_tokens=8192,
            fast_model_max_tokens=2048,
            posthog_enabled=False,
            posthog_api_key="",
            posthog_host="https://eu.i.posthog.com",
        )


class StubOrchestratorAgent:
    async def handle(self, request: OrchestratorRequest) -> PdfQuestionNeedContentResponse:
        return PdfQuestionNeedContentResponse(reason=request.user_message, files=[], max_pages=1, max_characters=1000)


class StubPdfEditAgent:
    async def handle(self, request: PdfEditRequest) -> EditCannotDoResponse:
        return EditCannotDoResponse(reason=request.user_message)


class StubPdfQuestionAgent:
    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionNotFoundResponse:
        return PdfQuestionNotFoundResponse(reason=request.question)


class StubUserSpecAgent:
    async def draft(self, request: AgentDraftRequest) -> AgentDraftResponse:
        return AgentDraftResponse(
            draft=AgentDraft(
                name="Drafted",
                description="Route wiring test",
                objective=request.user_message,
                steps=[],
            )
        )

    async def revise(self, request: AgentRevisionRequest) -> AgentRevisionResponse:
        return AgentRevisionResponse(draft=request.current_draft)


class StubExecutionPlanningAgent:
    async def next_action(self, request: AgentExecutionRequest) -> CannotContinueExecutionAction:
        return CannotContinueExecutionAction(reason=str(request.current_step_index))


client: TestClient = TestClient(app)


def override_settings() -> AppSettings:
    return StubSettingsProvider()()


def override_orchestrator_agent() -> StubOrchestratorAgent:
    return StubOrchestratorAgent()


def override_pdf_edit_agent() -> StubPdfEditAgent:
    return StubPdfEditAgent()


def override_pdf_question_agent() -> StubPdfQuestionAgent:
    return StubPdfQuestionAgent()


def override_user_spec_agent() -> StubUserSpecAgent:
    return StubUserSpecAgent()


def override_execution_agent() -> StubExecutionPlanningAgent:
    return StubExecutionPlanningAgent()


app.dependency_overrides[load_settings] = override_settings
app.dependency_overrides[get_orchestrator_agent] = override_orchestrator_agent
app.dependency_overrides[get_pdf_edit_agent] = override_pdf_edit_agent
app.dependency_overrides[get_pdf_question_agent] = override_pdf_question_agent
app.dependency_overrides[get_user_spec_agent] = override_user_spec_agent
app.dependency_overrides[get_execution_planning_agent] = override_execution_agent


def test_health_route() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_orchestrator_route() -> None:
    response = client.post("/api/v1/orchestrator", json={"userMessage": "route this", "fileNames": ["test.pdf"]})

    assert response.status_code == 200
    assert response.json()["outcome"] == "need_content"


def test_pdf_edit_route() -> None:
    response = client.post("/api/v1/pdf/edit", json={"userMessage": "rotate this"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "cannot_do"


def test_pdf_questions_route() -> None:
    response = client.post(
        "/api/v1/pdf/questions",
        json={
            "question": "what is this?",
            "fileNames": ["test.pdf"],
            "pageText": [{"fileName": "test.pdf", "pages": [{"pageNumber": 1, "text": "Example"}]}],
        },
    )

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
