"""
Contradiction Agent — FastAPI routes.

Two internal endpoints, called only by the Java
``ContradictionAgentOrchestrator``:

  POST /api/v1/ai/contradiction-agent/examine
      Java sends a FolioManifest (cheap page classification).
      Python returns a Requisition (what Java must extract).

  POST /api/v1/ai/contradiction-agent/deliberate
      Java sends Evidence (fulfilled extraction results).
      Python returns a ContradictionVerdict directly.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents.contradiction import ContradictionAgent
from stirling.api.dependencies import get_contradiction_agent
from stirling.contracts.contradiction import (
    ContradictionVerdict,
    Evidence,
    FolioManifest,
    Requisition,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai/contradiction-agent", tags=["contradiction-agent"])


@router.post("/examine", response_model=Requisition)
async def examine_endpoint(
    manifest: FolioManifest,
    agent: Annotated[ContradictionAgent, Depends(get_contradiction_agent)],
) -> Requisition:
    """Round 1: Java presents a FolioManifest; Python declares its Requisition."""
    return await agent.examine(manifest)


@router.post("/deliberate", response_model=ContradictionVerdict)
async def deliberate_endpoint(
    evidence: Evidence,
    agent: Annotated[ContradictionAgent, Depends(get_contradiction_agent)],
) -> ContradictionVerdict:
    """Round 2: Java presents fulfilled Evidence; Python returns a ContradictionVerdict."""
    return await agent.deliberate(evidence)
