"""
Ledger Auditor — FastAPI route tests.

Uses FastAPI's TestClient with dependency overrides. All LLM calls are
mocked out; these tests exercise HTTP parsing, serialisation, and response
enveloping only — not the agent's reasoning.
"""

from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_math_auditor_agent
from stirling.config import AppSettings, load_settings
from stirling.contracts.ledger import (
    Discrepancy,
    DiscrepancyKind,
    Evidence,
    FolioManifest,
    Requisition,
    Severity,
    Verdict,
)

# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class StubSettingsProvider:
    def __call__(self) -> AppSettings:
        from conftest import build_app_settings

        return build_app_settings()


class StubLedgerAgent:
    """Stub that returns canned responses without touching any model."""

    def __init__(
        self,
        requisition: Requisition | None = None,
        verdict: Verdict | None = None,
    ) -> None:
        self._requisition = requisition or _stub_requisition()
        self._verdict = verdict or _stub_verdict()
        self.examine_calls: list[FolioManifest] = []
        self.audit_calls: list[tuple[Evidence, Decimal]] = []

    async def examine(self, manifest: FolioManifest) -> Requisition:
        self.examine_calls.append(manifest)
        return self._requisition

    async def audit(self, evidence: Evidence, tolerance: Decimal = Decimal("0.01")) -> Verdict:
        self.audit_calls.append((evidence, tolerance))
        return self._verdict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _stub_requisition() -> Requisition:
    return Requisition(
        need_text=[0, 2],
        need_tables=[0],
        need_ocr=[1],
        rationale="Page 1 is image-only; pages 0 and 2 have financial text.",
    )


def _stub_verdict(
    clean: bool = True,
    discrepancies: list[Discrepancy] | None = None,
) -> Verdict:
    return Verdict(
        session_id="test-session",
        discrepancies=discrepancies or [],
        pages_examined=[0, 2],
        rounds_taken=2,
        summary="No errors found." if clean else "1 tally error found.",
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
            {"page": 0, "text": "Fee: £100\nTax: £20\nTotal: £120"},
            {"page": 2, "text": "Summary: all tallies correct"},
        ],
        "round": 2,
        "finalRound": False,
    }
    return {**base, **overrides}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def stub_agent() -> StubLedgerAgent:
    return StubLedgerAgent()


@pytest.fixture
def client(stub_agent: StubLedgerAgent) -> Iterator[TestClient]:
    app.dependency_overrides[load_settings] = StubSettingsProvider()
    app.dependency_overrides[get_math_auditor_agent] = lambda: stub_agent
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(load_settings, None)
    app.dependency_overrides.pop(get_math_auditor_agent, None)


# ---------------------------------------------------------------------------
# POST /api/v1/ai/math-auditor-agent/examine
# ---------------------------------------------------------------------------


class TestExamineEndpoint:
    """Tests for POST /api/v1/ai/math-auditor-agent/examine."""

    def test_returns_200(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/examine", json=_manifest_body())
        assert resp.status_code == 200

    def test_response_is_requisition(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/examine", json=_manifest_body())
        body = resp.json()
        assert body["type"] == "requisition"
        assert body["needText"] == [0, 2]
        assert body["needTables"] == [0]
        assert body["needOcr"] == [1]
        assert "rationale" in body

    def test_examine_called_with_parsed_manifest(
        self,
        client: TestClient,
        stub_agent: StubLedgerAgent,
    ) -> None:
        client.post("/api/v1/ai/math-auditor-agent/examine", json=_manifest_body(sessionId="my-session", pageCount=3))
        assert len(stub_agent.examine_calls) == 1
        manifest = stub_agent.examine_calls[0]
        assert manifest.session_id == "my-session"
        assert manifest.page_count == 3

    def test_content_type_is_json(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/examine", json=_manifest_body())
        assert "application/json" in resp.headers["content-type"]


# ---------------------------------------------------------------------------
# POST /api/v1/ai/math-auditor-agent/deliberate
# ---------------------------------------------------------------------------


class TestDeliberateEndpoint:
    """Tests for POST /api/v1/ai/math-auditor-agent/deliberate."""

    def test_returns_200_clean(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/deliberate", json=_evidence_body())
        assert resp.status_code == 200

    def test_response_is_verdict(self, client: TestClient) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/deliberate", json=_evidence_body())
        body = resp.json()
        assert body["type"] == "verdict"
        assert body["clean"] is True

    def test_discrepancies_serialised(self, client: TestClient) -> None:
        d = Discrepancy(
            page=0,
            kind=DiscrepancyKind.TALLY,
            severity=Severity.ERROR,
            description="Column total wrong",
            stated="250",
            expected="300",
        )
        stub = StubLedgerAgent(verdict=_stub_verdict(clean=False, discrepancies=[d]))
        app.dependency_overrides[get_math_auditor_agent] = lambda: stub
        resp = client.post("/api/v1/ai/math-auditor-agent/deliberate", json=_evidence_body())
        body = resp.json()
        discrepancies = body["discrepancies"]
        assert len(discrepancies) == 1
        assert discrepancies[0]["kind"] == "tally"
        assert discrepancies[0]["severity"] == "error"
        assert discrepancies[0]["stated"] == "250"
        assert discrepancies[0]["expected"] == "300"

    def test_tolerance_query_param_forwarded(
        self,
        client: TestClient,
        stub_agent: StubLedgerAgent,
    ) -> None:
        client.post("/api/v1/ai/math-auditor-agent/deliberate?tolerance=0.05", json=_evidence_body())
        assert len(stub_agent.audit_calls) == 1
        _, tolerance = stub_agent.audit_calls[0]
        assert tolerance == Decimal("0.05")

    def test_default_tolerance_when_omitted(
        self,
        client: TestClient,
        stub_agent: StubLedgerAgent,
    ) -> None:
        client.post("/api/v1/ai/math-auditor-agent/deliberate", json=_evidence_body())
        _, tolerance = stub_agent.audit_calls[0]
        assert tolerance == Decimal("0.01")

    def test_invalid_tolerance_returns_400(
        self,
        client: TestClient,
        stub_agent: StubLedgerAgent,
    ) -> None:
        resp = client.post("/api/v1/ai/math-auditor-agent/deliberate?tolerance=notanumber", json=_evidence_body())
        assert resp.status_code == 400

    def test_final_round_flag_parsed(
        self,
        client: TestClient,
        stub_agent: StubLedgerAgent,
    ) -> None:
        client.post("/api/v1/ai/math-auditor-agent/deliberate", json=_evidence_body(finalRound=True))
        evidence, _ = stub_agent.audit_calls[0]
        assert evidence.final_round is True
