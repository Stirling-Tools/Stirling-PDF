"""
Math Auditor Agent (mathAuditorAgent) — FastAPI routes.

Two internal endpoints, called only by the Java MathAuditorOrchestrator:

  POST /api/v1/ai/math-auditor-agent/examine
      Java sends a FolioManifest (cheap page classification).
      Python returns a Requisition (what Java must extract).

  POST /api/v1/ai/math-auditor-agent/deliberate
      Java sends Evidence (fulfilled extraction results).
      Python returns a Verdict directly.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from stirling.agents.ledger import MathAuditorAgent
from stirling.api.dependencies import get_math_auditor_agent
from stirling.contracts.ledger import (
    Evidence,
    FolioManifest,
    Requisition,
    Verdict,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai/math-auditor-agent", tags=["math-auditor-agent"])


@router.post("/examine", response_model=Requisition)
async def examine_endpoint(
    manifest: FolioManifest,
    agent: Annotated[MathAuditorAgent, Depends(get_math_auditor_agent)],
) -> Requisition:
    """Round 1: Java presents a FolioManifest; Python declares its Requisition."""
    return await agent.examine(manifest)


@router.post("/deliberate", response_model=Verdict)
async def deliberate_endpoint(
    evidence: Evidence,
    agent: Annotated[MathAuditorAgent, Depends(get_math_auditor_agent)],
    tolerance: str = Query(default="0.01"),
) -> Verdict:
    """Round 2: Java presents fulfilled Evidence; Python returns a Verdict."""
    try:
        tol = Decimal(tolerance)
        if tol < 0:
            raise HTTPException(status_code=400, detail="tolerance must be non-negative")
    except InvalidOperation:
        raise HTTPException(status_code=400, detail=f"Invalid tolerance value: {tolerance!r}")

    return await agent.audit(evidence, tol)
