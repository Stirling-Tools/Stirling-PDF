from conftest import build_app_settings
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import (
    get_execution_planning_agent,
    get_orchestrator_agent,
    get_pdf_edit_agent,
    get_pdf_question_agent,
    get_user_spec_agent,
)
from stirling.config import load_settings
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentExecutionRequest,
    AgentRevisionRequest,
    AgentRevisionResponse,
    CannotContinueExecutionAction,
    EditCannotDoResponse,
    NeedContentResponse,
    OrchestratorRequest,
    PdfEditRequest,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    SupportedCapability,
)
from stirling.models.tool_models import Angle, RotatePdfParams


class StubOrchestratorAgent:
    async def handle(self, request: OrchestratorRequest) -> NeedContentResponse:
        return NeedContentResponse(
            resume_with=SupportedCapability.PDF_QUESTION,
            reason=request.user_message,
            files=[],
            max_pages=1,
            max_characters=1000,
        )


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


app.dependency_overrides[load_settings] = build_app_settings
app.dependency_overrides[get_orchestrator_agent] = lambda: StubOrchestratorAgent()
app.dependency_overrides[get_pdf_edit_agent] = lambda: StubPdfEditAgent()
app.dependency_overrides[get_pdf_question_agent] = lambda: StubPdfQuestionAgent()
app.dependency_overrides[get_user_spec_agent] = lambda: StubUserSpecAgent()
app.dependency_overrides[get_execution_planning_agent] = lambda: StubExecutionPlanningAgent()

client: TestClient = TestClient(app)


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
                        "tool": "/api/v1/general/rotate-pdf",
                        "parameters": RotatePdfParams(angle=Angle(90)).model_dump(by_alias=True),
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
                        "tool": "/api/v1/general/rotate-pdf",
                        "parameters": RotatePdfParams(angle=Angle(90)).model_dump(by_alias=True),
                    }
                ],
            },
            "currentStepIndex": 0,
            "executionContext": {"inputFiles": ["input.pdf"], "metadata": {}},
        },
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "cannot_continue"
