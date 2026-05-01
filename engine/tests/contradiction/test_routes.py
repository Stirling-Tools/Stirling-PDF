"""
Contradiction Agent — FastAPI route tests.

Uses FastAPI's TestClient with dependency overrides. All LLM calls are
mocked out via a stub agent; these tests exercise HTTP parsing,
serialisation, and response enveloping only — not the agent's reasoning.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_contradiction_agent
from stirling.config import AppSettings, load_settings
from stirling.contracts.contradiction import (
    Claim,
    Contradiction,
    ContradictionSeverity,
    ContradictionVerdict,
    Evidence,
    FolioManifest,
    Requisition,
)


# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class StubSettingsProvider:
    def __call__(self) -> AppSettings:
        from conftest import build_app_settings

        return build_app_settings()


class StubContradictionAgent:
    """Stub that returns canned responses without touching any model."""

    def __init__(
        self,
        requisition: Requisition | None = None,
        verdict: ContradictionVerdict | None = None,
    ) -> None:
        self._requisition = requisition or _stub_requisition()
        self._verdict = verdict or _stub_verdict()
        self.examine_calls: list[FolioManifest] = []
        self.deliberate_calls: list[Evidence] = []

    async def examine(self, manifest: FolioManifest) -> Requisition:
        self.examine_calls.append(manifest)
        return self._requisition

    async def deliberate(self, evidence: Evidence) -> ContradictionVerdict:
        self.deliberate_calls.append(evidence)
        return self._verdict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _stub_requisition() -> Requisition:
    return Requisition(
        need_text=[0, 2],
        need_tables=[],  # contradiction agent never asks for tables
        need_ocr=[1],
        rationale="text on pages 0/2; image-only page 1.",
    )


def _stub_verdict(
    clean: bool = True,
    contradictions: list[Contradiction] | None = None,
) -> ContradictionVerdict:
    return ContradictionVerdict(
        session_id="test-session",
        contradictions=contradictions or [],
        pages_examined=[0, 2],
        rounds_taken=2,
        summary="No contradictions found." if clean else "1 contradiction found.",
        clean=clean,
    )


def _manifest_body(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "sessionId": "test-session",
        "pageCount": 3,
        "folioTypes": ["text", "image", "mixed"],
        "round": 1,
    }
    return {**base, **overrides}


def _evidence_body(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "sessionId": "test-session",
        "folios": [
            {"page": 0, "text": "Project deadline is Friday."},
            {"page": 2, "text": "The project deadline has been moved to next month."},
        ],
        "round": 2,
        "finalRound": False,
    }
    return {**base, **overrides}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def stub_agent() -> StubContradictionAgent:
    return StubContradictionAgent()


@pytest.fixture
def client(stub_agent: StubContradictionAgent) -> Iterator[TestClient]:
    app.dependency_overrides[load_settings] = StubSettingsProvider()
    app.dependency_overrides[get_contradiction_agent] = lambda: stub_agent
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(load_settings, None)
    app.dependency_overrides.pop(get_contradiction_agent, None)


# ---------------------------------------------------------------------------
# POST /api/v1/ai/contradiction-agent/examine
# ---------------------------------------------------------------------------


class TestExamineEndpoint:
    def test_returns_200(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/examine", json=_manifest_body()
        )
        assert resp.status_code == 200

    def test_response_is_requisition(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/examine", json=_manifest_body()
        )
        body = resp.json()
        assert body["type"] == "requisition"
        assert body["needText"] == [0, 2]
        assert body["needTables"] == []
        assert body["needOcr"] == [1]
        assert "rationale" in body

    def test_examine_called_with_parsed_manifest(
        self,
        client: TestClient,
        stub_agent: StubContradictionAgent,
    ) -> None:
        client.post(
            "/api/v1/ai/contradiction-agent/examine",
            json=_manifest_body(sessionId="my-session", pageCount=3),
        )
        assert len(stub_agent.examine_calls) == 1
        manifest = stub_agent.examine_calls[0]
        assert manifest.session_id == "my-session"
        assert manifest.page_count == 3

    def test_malformed_body_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/examine",
            json={"sessionId": "x"},  # missing required fields
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/ai/contradiction-agent/deliberate
# ---------------------------------------------------------------------------


class TestDeliberateEndpoint:
    def test_returns_200_clean(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/deliberate", json=_evidence_body()
        )
        assert resp.status_code == 200

    def test_response_is_verdict(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/deliberate", json=_evidence_body()
        )
        body = resp.json()
        assert body["type"] == "contradiction_verdict"
        assert body["clean"] is True
        assert body["contradictions"] == []

    def test_contradictions_serialised(self, client: TestClient) -> None:
        contradiction = Contradiction(
            subject="project deadline",
            claim1=Claim(
                page=0,
                subject="project deadline",
                polarity="assert",
                text="The deadline is Friday.",
                quote="deadline is Friday",
            ),
            claim2=Claim(
                page=2,
                subject="project deadline",
                polarity="deny",
                text="The deadline has moved to next month.",
                quote="moved to next month",
            ),
            explanation="page 1 says Friday, page 3 says next month.",
            severity=ContradictionSeverity.ERROR,
        )
        stub = StubContradictionAgent(
            verdict=_stub_verdict(clean=False, contradictions=[contradiction])
        )
        app.dependency_overrides[get_contradiction_agent] = lambda: stub

        resp = client.post(
            "/api/v1/ai/contradiction-agent/deliberate", json=_evidence_body()
        )

        body = resp.json()
        contradictions = body["contradictions"]
        assert len(contradictions) == 1
        assert contradictions[0]["severity"] == "error"
        assert contradictions[0]["subject"] == "project deadline"
        assert contradictions[0]["claim1"]["page"] == 0
        assert contradictions[0]["claim2"]["page"] == 2

    def test_malformed_body_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/ai/contradiction-agent/deliberate",
            json={"sessionId": "x"},  # missing folios, round
        )
        assert resp.status_code == 422

    def test_tolerance_query_param_is_gracefully_ignored(
        self,
        client: TestClient,
        stub_agent: StubContradictionAgent,
    ) -> None:
        """Regression: this route does NOT accept ``?tolerance=...`` (unlike the
        math auditor's deliberate route). FastAPI ignores unknown query params,
        so passing one must still yield a 200."""
        resp = client.post(
            "/api/v1/ai/contradiction-agent/deliberate?tolerance=0.5",
            json=_evidence_body(),
        )
        assert resp.status_code == 200
        # The agent still received a fully-validated Evidence object; the
        # tolerance was silently dropped at the route layer.
        assert len(stub_agent.deliberate_calls) == 1

    def test_final_round_flag_parsed(
        self,
        client: TestClient,
        stub_agent: StubContradictionAgent,
    ) -> None:
        client.post(
            "/api/v1/ai/contradiction-agent/deliberate",
            json=_evidence_body(finalRound=True),
        )
        assert stub_agent.deliberate_calls[0].final_round is True
