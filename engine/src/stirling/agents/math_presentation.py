"""
Math-auditor presentation helper.

Used by ``PdfQuestionAgent`` and ``PdfReviewAgent`` to pull a Verdict back
out of the resume-turn artifacts. Math intent itself is decided by the
orchestrator's top-level LLM (so it works in any language) and passed in
as a flag — this module no longer does its own English-only intent guess.
"""

from __future__ import annotations

from stirling.contracts import (
    OrchestratorRequest,
    ToolReportArtifact,
    Verdict,
)
from stirling.models.agent_tool_models import AgentToolId


def extract_math_verdict(request: OrchestratorRequest) -> Verdict | None:
    """Find a math-auditor Verdict in the request's artifacts, if any.

    Meta-agents call this on resume to detect whether the specialist has
    already run. Returns ``None`` on the first turn (before the plan fires)
    and a hydrated :class:`Verdict` on the resume turn.
    """
    for artifact in request.artifacts:
        if not isinstance(artifact, ToolReportArtifact):
            continue
        if artifact.source_tool != AgentToolId.MATH_AUDITOR_AGENT:
            continue
        try:
            return Verdict.model_validate(artifact.report)
        except Exception:  # noqa: BLE001 — malformed report degrades gracefully
            return None
    return None
