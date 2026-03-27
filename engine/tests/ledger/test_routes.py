"""
Ledger Auditor — Flask route tests.

Uses Flask's built-in test client. All LLM calls are mocked out; these tests
exercise HTTP parsing, serialisation, and response enveloping only — not the
agent's reasoning.
"""

from __future__ import annotations

import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from flask import Flask
from flask.testing import FlaskClient

from ledger.models import (
    Discrepancy,
    DiscrepancyKind,
    Requisition,
    Severity,
    Verdict,
)
from ledger.routes import register_ledger_routes


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def app() -> Flask:
    """Minimal Flask app with only the ledger blueprint registered."""
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    register_ledger_routes(flask_app)
    return flask_app


@pytest.fixture(scope="module")
def client(app: Flask) -> FlaskClient:
    """Test client scoped to the module-level Flask app."""
    return app.test_client()


def _manifest_body(**overrides: object) -> dict[str, object]:
    """Build a minimal valid FolioManifest payload, with optional field overrides."""
    base: dict[str, object] = {
        "session_id": "test-session",
        "page_count": 3,
        "folio_types": ["text", "image", "mixed"],
        "round": 1,
    }
    return {**base, **overrides}


def _evidence_body(**overrides: object) -> dict[str, object]:
    """Build a minimal valid Evidence payload, with optional field overrides."""
    base: dict[str, object] = {
        "session_id": "test-session",
        "folios": [
            {"page": 0, "text": "Fee: £100\nTax: £20\nTotal: £120"},
            {"page": 2, "text": "Summary: all tallies correct"},
        ],
        "round": 2,
        "final_round": False,
    }
    return {**base, **overrides}


def _stub_requisition() -> Requisition:
    """Return a canned Requisition for use in mocked route tests."""
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
    """Return a canned Verdict for use in mocked route tests."""
    return Verdict(
        session_id="test-session",
        discrepancies=discrepancies or [],
        pages_examined=[0, 2],
        rounds_taken=2,
        summary="No errors found." if clean else "1 tally error found.",
        clean=clean,
    )


# ---------------------------------------------------------------------------
# POST /api/ledger/examine
# ---------------------------------------------------------------------------


class TestExamineEndpoint:
    """Tests for POST /api/ledger/examine."""

    def test_returns_200(self, client: FlaskClient) -> None:
        """A valid manifest must yield an HTTP 200."""
        with patch("ledger.routes.examine", return_value=_stub_requisition()):
            resp = client.post(
                "/api/ledger/examine",
                data=json.dumps(_manifest_body()),
                content_type="application/json",
            )
        assert resp.status_code == 200

    def test_response_is_requisition(self, client: FlaskClient) -> None:
        """Response body must be a valid Requisition JSON object."""
        with patch("ledger.routes.examine", return_value=_stub_requisition()):
            resp = client.post(
                "/api/ledger/examine",
                data=json.dumps(_manifest_body()),
                content_type="application/json",
            )
        body = resp.get_json()
        assert body["type"] == "requisition"
        assert body["need_text"] == [0, 2]
        assert body["need_tables"] == [0]
        assert body["need_ocr"] == [1]
        assert "rationale" in body

    def test_examine_called_with_parsed_manifest(self, client: FlaskClient) -> None:
        """The route must parse the JSON body into a FolioManifest and forward it."""
        with patch("ledger.routes.examine", return_value=_stub_requisition()) as mock_examine:
            client.post(
                "/api/ledger/examine",
                data=json.dumps(_manifest_body(session_id="my-session", page_count=3)),
                content_type="application/json",
            )
        assert mock_examine.call_count == 1
        manifest_arg = mock_examine.call_args[0][0]
        assert manifest_arg.session_id == "my-session"
        assert manifest_arg.page_count == 3

    def test_empty_body_is_rejected(self, client: FlaskClient) -> None:
        """Sending an empty or invalid body must not return 200."""
        with patch("ledger.routes.examine", return_value=_stub_requisition()):
            resp = client.post(
                "/api/ledger/examine",
                data="{}",
                content_type="application/json",
            )
        # Pydantic validation failure raises → Flask returns 4xx or 500
        assert resp.status_code != 200

    def test_content_type_is_json(self, client: FlaskClient) -> None:
        """Response Content-Type must be application/json."""
        with patch("ledger.routes.examine", return_value=_stub_requisition()):
            resp = client.post(
                "/api/ledger/examine",
                data=json.dumps(_manifest_body()),
                content_type="application/json",
            )
        assert "application/json" in resp.content_type


# ---------------------------------------------------------------------------
# POST /api/ledger/deliberate
# ---------------------------------------------------------------------------


class TestDeliberateEndpoint:
    """Tests for POST /api/ledger/deliberate."""

    def test_returns_200_clean(self, client: FlaskClient) -> None:
        """A clean verdict must yield HTTP 200."""
        with patch("ledger.routes.audit", return_value=_stub_verdict(clean=True)):
            resp = client.post(
                "/api/ledger/deliberate",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        assert resp.status_code == 200

    def test_response_envelope_has_verdict(self, client: FlaskClient) -> None:
        """The /deliberate response is wrapped in an AgentTurn envelope."""
        with patch("ledger.routes.audit", return_value=_stub_verdict()):
            resp = client.post(
                "/api/ledger/deliberate",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        body = resp.get_json()
        assert "verdict" in body
        assert body.get("requisition") is None or body.get("requisition") == {}
        verdict = body["verdict"]
        assert verdict["type"] == "verdict"
        assert verdict["clean"] is True

    def test_discrepancies_serialised(self, client: FlaskClient) -> None:
        """Discrepancy fields must be present and correctly serialised in the response."""
        d = Discrepancy(
            page=0,
            kind=DiscrepancyKind.TALLY,
            severity=Severity.ERROR,
            description="Column total wrong",
            stated="250",
            expected="300",
        )
        with patch(
            "ledger.routes.audit",
            return_value=_stub_verdict(clean=False, discrepancies=[d]),
        ):
            resp = client.post(
                "/api/ledger/deliberate",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        body = resp.get_json()
        discrepancies = body["verdict"]["discrepancies"]
        assert len(discrepancies) == 1
        assert discrepancies[0]["kind"] == "tally"
        assert discrepancies[0]["severity"] == "error"
        assert discrepancies[0]["stated"] == "250"
        assert discrepancies[0]["expected"] == "300"

    def test_tolerance_query_param_forwarded(self, client: FlaskClient) -> None:
        """The tolerance query param must be parsed and passed to audit()."""
        with patch("ledger.routes.audit", return_value=_stub_verdict()) as mock_audit:
            client.post(
                "/api/ledger/deliberate?tolerance=0.05",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        assert mock_audit.call_count == 1
        tolerance_arg = mock_audit.call_args[0][1]  # positional arg 1
        assert tolerance_arg == Decimal("0.05")

    def test_default_tolerance_when_omitted(self, client: FlaskClient) -> None:
        """Omitting tolerance must default to 0.01."""
        with patch("ledger.routes.audit", return_value=_stub_verdict()) as mock_audit:
            client.post(
                "/api/ledger/deliberate",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        tolerance_arg = mock_audit.call_args[0][1]
        assert tolerance_arg == Decimal("0.01")

    def test_invalid_tolerance_falls_back_to_default(self, client: FlaskClient) -> None:
        """A non-numeric tolerance must not crash — it falls back to 0.01."""
        with patch("ledger.routes.audit", return_value=_stub_verdict()) as mock_audit:
            resp = client.post(
                "/api/ledger/deliberate?tolerance=notanumber",
                data=json.dumps(_evidence_body()),
                content_type="application/json",
            )
        assert resp.status_code == 200
        tolerance_arg = mock_audit.call_args[0][1]
        assert tolerance_arg == Decimal("0.01")

    def test_final_round_flag_parsed(self, client: FlaskClient) -> None:
        """final_round=True in the Evidence body must reach audit() correctly."""
        with patch("ledger.routes.audit", return_value=_stub_verdict()) as mock_audit:
            client.post(
                "/api/ledger/deliberate",
                data=json.dumps(_evidence_body(final_round=True)),
                content_type="application/json",
            )
        evidence_arg = mock_audit.call_args[0][0]
        assert evidence_arg.final_round is True
