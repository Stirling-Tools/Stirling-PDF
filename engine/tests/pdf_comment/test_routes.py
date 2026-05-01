"""
PDF Comment Agent — FastAPI route tests.

Uses the FastAPI :class:`TestClient` with dependency overrides so the tests
exercise HTTP parsing, validation, and serialisation only — never the real
pydantic-ai agent.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_pdf_comment_agent
from stirling.config import AppSettings, RagBackend, load_settings
from stirling.contracts.pdf_comments import (
    PdfCommentInstruction,
    PdfCommentRequest,
    PdfCommentResponse,
)

# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class StubSettingsProvider:
    def __call__(self) -> AppSettings:
        return AppSettings(
            smart_model_name="test",
            fast_model_name="test",
            smart_model_max_tokens=8192,
            fast_model_max_tokens=2048,
            rag_backend=RagBackend.SQLITE,
            rag_embedding_model="test-embed",
            rag_store_path=Path(":memory:"),
            rag_pgvector_dsn="",
            rag_chunk_size=512,
            rag_chunk_overlap=64,
            rag_default_top_k=5,
            max_pages=100,
            max_characters=100_000,
            posthog_enabled=False,
            posthog_api_key="",
            posthog_host="https://eu.i.posthog.com",
        )


class StubPdfCommentAgent:
    """Stub that echoes the session id and returns a canned comment."""

    def __init__(self, response: PdfCommentResponse | None = None) -> None:
        self._response = response
        self.generate_calls: list[PdfCommentRequest] = []

    async def generate(self, request: PdfCommentRequest) -> PdfCommentResponse:
        self.generate_calls.append(request)
        if self._response is not None:
            return self._response
        return PdfCommentResponse(
            session_id=request.session_id,
            comments=[
                PdfCommentInstruction(
                    chunk_id=request.chunks[0].id if request.chunks else "p0-c0",
                    comment_text="Stub comment.",
                )
            ],
            rationale="stubbed response",
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def stub_agent() -> StubPdfCommentAgent:
    return StubPdfCommentAgent()


@pytest.fixture
def client(stub_agent: StubPdfCommentAgent) -> Iterator[TestClient]:
    app.dependency_overrides[load_settings] = StubSettingsProvider()
    app.dependency_overrides[get_pdf_comment_agent] = lambda: stub_agent
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(load_settings, None)
    app.dependency_overrides.pop(get_pdf_comment_agent, None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _camel_request_body() -> dict[str, object]:
    return {
        "sessionId": "sess-1",
        "userMessage": "flag dates",
        "chunks": [
            {
                "id": "p0-c0",
                "page": 0,
                "x": 72.0,
                "y": 700.0,
                "width": 200.0,
                "height": 12.0,
                "text": "Signed on 5/6/2026",
            }
        ],
    }


def _snake_request_body() -> dict[str, object]:
    return {
        "session_id": "sess-snake",
        "user_message": "flag dates",
        "chunks": [
            {
                "id": "p0-c0",
                "page": 0,
                "x": 72.0,
                "y": 700.0,
                "width": 200.0,
                "height": 12.0,
                "text": "Snake case text",
            }
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/v1/ai/pdf-comment-agent/generate
# ---------------------------------------------------------------------------


class TestGenerateEndpoint:
    def test_camel_case_body_returns_200(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/pdf-comment-agent/generate", json=_camel_request_body())
        assert resp.status_code == 200

    def test_camel_case_body_response_has_expected_shape(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/pdf-comment-agent/generate", json=_camel_request_body())
        body = resp.json()
        assert body["sessionId"] == "sess-1"
        assert isinstance(body["comments"], list)
        assert len(body["comments"]) == 1
        comment = body["comments"][0]
        assert comment["chunkId"] == "p0-c0"
        assert comment["commentText"] == "Stub comment."
        assert "rationale" in body

    def test_snake_case_body_is_still_accepted(self, client: TestClient) -> None:
        """ApiModel has validate_by_name=True & validate_by_alias=True, so snake_case
        payloads must still be accepted."""
        resp = client.post("/api/v1/ai/pdf-comment-agent/generate", json=_snake_request_body())
        assert resp.status_code == 200
        body = resp.json()
        # Response is always serialised in camelCase regardless of request form.
        assert body["sessionId"] == "sess-snake"

    def test_missing_required_field_returns_422(self, client: TestClient) -> None:
        body = _camel_request_body()
        del body["sessionId"]
        resp = client.post("/api/v1/ai/pdf-comment-agent/generate", json=body)
        assert resp.status_code == 422

    def test_agent_is_called_with_parsed_request(
        self,
        client: TestClient,
        stub_agent: StubPdfCommentAgent,
    ) -> None:
        client.post("/api/v1/ai/pdf-comment-agent/generate", json=_camel_request_body())
        assert len(stub_agent.generate_calls) == 1
        call = stub_agent.generate_calls[0]
        assert call.session_id == "sess-1"
        assert call.user_message == "flag dates"
        assert len(call.chunks) == 1
        assert call.chunks[0].id == "p0-c0"

    def test_agent_exception_surfaces_as_500(self) -> None:
        """If the agent raises (LLM outage, auth failure, OOM), the route must
        surface it as HTTP 500 so Java's AiEngineClient maps it to 502 — rather
        than silently returning an empty/successful response that the Java caller
        would mis-apply as 'zero comments to place'."""

        class FailingAgent:
            async def generate(self, _request: PdfCommentRequest) -> PdfCommentResponse:
                raise RuntimeError("model provider unreachable")

        app.dependency_overrides[load_settings] = StubSettingsProvider()
        app.dependency_overrides[get_pdf_comment_agent] = lambda: FailingAgent()
        try:
            with TestClient(app, raise_server_exceptions=False) as failing_client:
                resp = failing_client.post("/api/v1/ai/pdf-comment-agent/generate", json=_camel_request_body())
            assert resp.status_code == 500
        finally:
            app.dependency_overrides.pop(load_settings, None)
            app.dependency_overrides.pop(get_pdf_comment_agent, None)
