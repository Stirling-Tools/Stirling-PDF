"""
Ledger Auditor — Flask blueprint.

Two internal endpoints, called only by the Java AuditOrchestrator:

  POST /api/ledger/examine
      Java sends a FolioManifest (cheap page classification).
      Python returns a Requisition (what Java must extract).

  POST /api/ledger/deliberate
      Java sends Evidence (fulfilled extraction results).
      Python always returns a Verdict — the Auditor renders its final opinion
      on whatever evidence is available. Pages for which evidence could not
      be provided (e.g. OCR not wired) appear in Verdict.unauditable_pages.

Both endpoints are synchronous; pydantic-ai agents use run_sync() internally.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from flask import Blueprint, Flask, Response, jsonify, request

from .agent import audit, examine
from .models import AgentTurn, Evidence, FolioManifest, Requisition

logger = logging.getLogger(__name__)

ledger_blueprint = Blueprint("ledger", __name__)


def _json_body[T](model: type[T]) -> T:
    return model.model_validate(request.get_json(silent=True) or {})


# ---------------------------------------------------------------------------
# POST /api/ledger/examine
# ---------------------------------------------------------------------------


@ledger_blueprint.route("/api/ledger/examine", methods=["POST"])
def examine_endpoint() -> Response:
    """
    Round 1: Java presents the FolioManifest; Python declares its Requisition.

    Request body:  FolioManifest JSON
    Response body: Requisition JSON  (type="requisition")
    """
    manifest = _json_body(FolioManifest)
    requisition: Requisition = examine(manifest)
    return jsonify(requisition.model_dump())


# ---------------------------------------------------------------------------
# POST /api/ledger/deliberate
# ---------------------------------------------------------------------------


@ledger_blueprint.route("/api/ledger/deliberate", methods=["POST"])
def deliberate_endpoint() -> Response:
    """
    Round 2: Java presents fulfilled Evidence; Python returns a Verdict.

    The Auditor always returns a Verdict this round — it works with whatever
    evidence Java provided. Pages that could not be extracted (e.g. OCR
    requested but unavailable) are listed in Verdict.unauditable_pages.

    Request body:  Evidence JSON
    Response body: AgentTurn JSON  { verdict: {...} }
    """
    evidence = _json_body(Evidence)

    # Tolerance is an optional query parameter; defaults to 0.01 (1 penny).
    try:
        tolerance = Decimal(request.args.get("tolerance", "0.01"))
    except InvalidOperation:
        tolerance = Decimal("0.01")

    verdict = audit(evidence, tolerance)
    turn = AgentTurn(verdict=verdict)
    return jsonify(turn.model_dump())


# ---------------------------------------------------------------------------
# Registration helper (called from app.py)
# ---------------------------------------------------------------------------


def register_ledger_routes(app: Flask) -> None:
    """Register the ledger blueprint with the Flask application."""
    app.register_blueprint(ledger_blueprint)
