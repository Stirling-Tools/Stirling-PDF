from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import (
    get_document_extractor_agent,
    get_execution_planning_agent,
    get_form_analyser_agent,
    get_form_filler_agent,
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
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    UnsupportedCapabilityResponse,
)
from stirling.contracts.form_fill import (
    AnalysedFileResult,
    CrossFileRole,
    DetectedRole,
    DocumentExtractionRequest,
    FileFillResult,
    FormAnalysisRequest,
    FormAnalysisResponse,
    FormFillBatchRequest,
    FormFillBatchResponse,
    KnowledgeUpdateResponse,
)
from stirling.models.tool_models import RotateParams


class StubSettingsProvider:
    def __call__(self) -> AppSettings:
        return AppSettings(
            smart_model_name="test",
            fast_model_name="test",
            smart_model_max_tokens=8192,
            fast_model_max_tokens=2048,
        )


class StubOrchestratorAgent:
    async def handle(self, request: OrchestratorRequest) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability="pdf_edit", message=request.user_message)


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


class StubFormAnalyserAgent:
    async def analyse(self, request: FormAnalysisRequest) -> FormAnalysisResponse:
        return FormAnalysisResponse(
            per_file=[
                AnalysedFileResult(
                    file_id=f.file_id,
                    file_name=f.file_name,
                    detected_roles=[
                        DetectedRole(
                            role_label="Primary", field_names=[ff.name for ff in f.form_fields], is_primary_person=True
                        )
                    ],
                )
                for f in request.files
            ],
            cross_file_roles=[
                CrossFileRole(
                    role_label="Primary",
                    file_ids=[f.file_id for f in request.files],
                    field_names_by_file={f.file_id: [ff.name for ff in f.form_fields] for f in request.files},
                    is_primary_person=True,
                )
            ],
            message="Stub analysis.",
        )


class StubFormFillerAgent:
    async def fill_batch(self, request: FormFillBatchRequest) -> FormFillBatchResponse:
        return FormFillBatchResponse(
            per_file=[FileFillResult(file_id=f.file_id, filled_fields=[]) for f in request.files],
            message="Stub fill.",
        )


class StubDocumentExtractorAgent:
    async def extract_multiple(self, request: DocumentExtractionRequest) -> KnowledgeUpdateResponse:
        return KnowledgeUpdateResponse(proposed_entries=[], message="Stub extraction.")


class StubExecutionPlanningAgent:
    async def next_action(self, request: AgentExecutionRequest) -> CannotContinueExecutionAction:
        return CannotContinueExecutionAction(reason=str(request.current_step_index))


client: TestClient = TestClient(app)


def override_settings() -> AppSettings:
    return StubSettingsProvider()()


app.dependency_overrides[load_settings] = override_settings
app.dependency_overrides[get_orchestrator_agent] = lambda: StubOrchestratorAgent()
app.dependency_overrides[get_pdf_edit_agent] = lambda: StubPdfEditAgent()
app.dependency_overrides[get_pdf_question_agent] = lambda: StubPdfQuestionAgent()
app.dependency_overrides[get_user_spec_agent] = lambda: StubUserSpecAgent()
app.dependency_overrides[get_execution_planning_agent] = lambda: StubExecutionPlanningAgent()
app.dependency_overrides[get_form_analyser_agent] = lambda: StubFormAnalyserAgent()
app.dependency_overrides[get_form_filler_agent] = lambda: StubFormFillerAgent()
app.dependency_overrides[get_document_extractor_agent] = lambda: StubDocumentExtractorAgent()


def test_health_route() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_orchestrator_route() -> None:
    response = client.post("/api/v1/orchestrator", json={"userMessage": "route this"})

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
                        "tool": "rotate",
                        "parameters": RotateParams(angle=90).model_dump(by_alias=True),
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "draft"


def test_form_analyse_route() -> None:
    response = client.post(
        "/api/v1/form/ai/analyse",
        json={
            "files": [
                {
                    "fileId": "f1",
                    "fileName": "test.pdf",
                    "formFields": [{"name": "name", "type": "text"}],
                }
            ]
        },
    )

    assert response.status_code == 200
    assert len(response.json()["crossFileRoles"]) > 0


def test_form_fill_batch_route() -> None:
    response = client.post(
        "/api/v1/form/ai/fill-batch",
        json={
            "files": [
                {
                    "fileId": "f1",
                    "formFields": [{"name": "name", "type": "text"}],
                    "roleLabel": "Primary",
                }
            ],
            "knowledge": {"first_name": "John"},
        },
    )

    assert response.status_code == 200
    assert response.json()["outcome"] == "batch_fill_result"


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
