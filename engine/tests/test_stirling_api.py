import asyncio
import json
from unittest.mock import patch

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
    WholeDocReadStarted,
    WholeDocSliceDone,
)
from stirling.models.tool_models import Angle, RotatePdfParams
from stirling.services import emit_progress


class StubOrchestratorAgent:
    async def handle(self, request: OrchestratorRequest) -> NeedContentResponse:
        return NeedContentResponse(
            resume_with=SupportedCapability.PDF_QUESTION,
            reason=request.user_message,
            files=[],
            max_pages=1,
            max_characters=1000,
        )


class StubProgressOrchestratorAgent:
    """Orchestrator stub that emits two progress events before returning.

    Used to verify the streaming endpoint plumbs the ContextVar emitter through
    to deep callees and forwards events as NDJSON in order.
    """

    async def handle(self, request: OrchestratorRequest) -> NeedContentResponse:
        await emit_progress(WholeDocReadStarted(question="x", pages=10, slices=2))
        await emit_progress(
            WholeDocSliceDone(
                completed=1,
                total=2,
                pages="pages=1-5",
                duration_ms=42,
                excerpts=2,
                facts=3,
            )
        )
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


def test_orchestrator_route_streams_result_only_when_no_progress() -> None:
    """The orchestrator endpoint always streams NDJSON. An agent that emits no
    progress events still produces a single ``result`` frame with the typed
    response body."""
    with client.stream(
        "POST",
        "/api/v1/orchestrator",
        json={"userMessage": "route this", "files": [{"id": "test-id", "name": "test.pdf"}]},
    ) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    assert [e["event"] for e in events] == ["result"]
    body = events[0]["response"]
    assert body["outcome"] == "need_content"


def test_orchestrator_route_streams_progress_then_result() -> None:
    """When an agent emits progress via the ContextVar emitter, those frames
    arrive on the wire before the final result frame."""
    app.dependency_overrides[get_orchestrator_agent] = lambda: StubProgressOrchestratorAgent()
    try:
        with client.stream(
            "POST",
            "/api/v1/orchestrator",
            json={"userMessage": "stream this", "files": [{"id": "test-id", "name": "test.pdf"}]},
        ) as response:
            assert response.status_code == 200
            events = [json.loads(line) for line in response.iter_lines() if line]
    finally:
        app.dependency_overrides[get_orchestrator_agent] = lambda: StubOrchestratorAgent()

    progress = [e for e in events if e["event"] == "progress"]
    results = [e for e in events if e["event"] == "result"]
    assert [p["phase"] for p in progress] == ["whole_doc_read_started", "whole_doc_slice_done"]
    assert progress[1]["completed"] == 1
    assert len(results) == 1
    response = results[0]["response"]
    assert response["outcome"] == "need_content"
    # Wire format must be camelCase: Java's Jackson deserializer expects camelCase
    # field names. ``maxPages`` here doubles as a regression guard against the
    # snake_case bug that surfaced as "need_ingest without listing any files to ingest".
    assert "maxPages" in response
    assert "max_pages" not in response


def test_orchestrator_route_emits_heartbeats_while_agent_is_busy() -> None:
    """While the agent is in flight, the streaming endpoint emits heartbeat
    frames at the configured cadence so each layer of the connection stays
    visibly alive and disconnects propagate within bounded latency."""

    class _SlowAgent:
        async def handle(self, _request: OrchestratorRequest) -> NeedContentResponse:
            # Sleep long enough for several heartbeats at the patched cadence.
            await asyncio.sleep(0.2)
            return NeedContentResponse(
                resume_with=SupportedCapability.PDF_QUESTION,
                reason="ok",
                files=[],
                max_pages=1,
                max_characters=1000,
            )

    app.dependency_overrides[get_orchestrator_agent] = lambda: _SlowAgent()
    try:
        with patch("stirling.api.routes.orchestrator.HEARTBEAT_INTERVAL_SECONDS", 0.03):
            with client.stream(
                "POST",
                "/api/v1/orchestrator",
                json={"userMessage": "wait", "files": [{"id": "test-id", "name": "test.pdf"}]},
            ) as response:
                assert response.status_code == 200
                events = [json.loads(line) for line in response.iter_lines() if line]
    finally:
        app.dependency_overrides[get_orchestrator_agent] = lambda: StubOrchestratorAgent()

    heartbeats = [e for e in events if e["event"] == "heartbeat"]
    results = [e for e in events if e["event"] == "result"]
    # At least a couple of heartbeats fired during the 0.2s agent sleep at 0.03s cadence.
    assert len(heartbeats) >= 2
    # The result still arrives after the agent finishes.
    assert len(results) == 1
    assert results[0]["response"]["outcome"] == "need_content"


def test_pdf_edit_route() -> None:
    response = client.post("/api/v1/pdf/edit", json={"userMessage": "rotate this"})

    assert response.status_code == 200
    assert response.json()["outcome"] == "cannot_do"


def test_routes_require_user_id_when_enforced() -> None:
    """With STIRLING_REQUIRE_USER_ID on, an identity-less request is rejected
    at the boundary before any handler runs; supplying X-User-Id is accepted.
    The other route tests in this module run with the flag off and cover the
    identity-less self-hosted path."""
    app.dependency_overrides[load_settings] = lambda: build_app_settings().model_copy(update={"require_user_id": True})
    try:
        anonymous = client.post("/api/v1/pdf/edit", json={"userMessage": "rotate this"})
        identified = client.post(
            "/api/v1/pdf/edit",
            json={"userMessage": "rotate this"},
            headers={"X-User-Id": "alice"},
        )
    finally:
        app.dependency_overrides[load_settings] = build_app_settings

    assert anonymous.status_code == 401
    assert identified.status_code == 200


def test_pdf_questions_route() -> None:
    response = client.post(
        "/api/v1/pdf/questions",
        json={
            "question": "what is this?",
            "files": [{"id": "test-id", "name": "test.pdf"}],
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
