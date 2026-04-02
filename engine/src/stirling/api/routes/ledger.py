"""
Ledger Auditor — FastAPI routes.

Two internal endpoints, called only by the Java AuditOrchestrator:

  POST /api/ledger/examine
      Java sends a FolioManifest (cheap page classification).
      Python returns a Requisition (what Java must extract).

  POST /api/ledger/deliberate
      Java sends Evidence (fulfilled extraction results).
      Python returns an AgentTurn containing a Verdict.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from stirling.agents.ledger import LedgerAuditorAgent
from stirling.agents.ledger.models import (
    AgentTurn, Evidence, FolioManifest, Requisition,
)
from stirling.api.dependencies import get_ledger_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.post("/examine", response_model=Requisition)
async def examine_endpoint(
    manifest: FolioManifest,
    agent: Annotated[LedgerAuditorAgent, Depends(get_ledger_agent)],
) -> Requisition:
    """Round 1: Java presents a FolioManifest; Python declares its Requisition."""
    return await agent.examine(manifest)


@router.post("/deliberate", response_model=AgentTurn)
async def deliberate_endpoint(
    evidence: Evidence,
    agent: Annotated[LedgerAuditorAgent, Depends(get_ledger_agent)],
    tolerance: str = Query(default="0.01"),
) -> AgentTurn:
    """Round 2: Java presents fulfilled Evidence; Python returns a Verdict."""
    try:
        tol = Decimal(tolerance)
    except InvalidOperation:
        tol = Decimal("0.01")

    verdict = await agent.audit(evidence, tol)
    return AgentTurn(verdict=verdict)
