"""
Math-auditor presentation helpers.

Used by ``PdfQuestionAgent`` and ``PdfReviewAgent`` to decide when to consult
the math auditor and to pull a Verdict back out of the resume-turn artifacts.

Deliberately language-agnostic: rendering a Verdict as prose or as sticky-note
text is the consumer's job (it has the user's prompt and a small LLM that
can answer in any language). This module emits no user-facing strings.
"""

from __future__ import annotations

import re

from stirling.contracts import (
    OrchestratorRequest,
    ToolReportArtifact,
    Verdict,
)
from stirling.models.agent_tool_models import AgentToolId

# Keywords that suggest the user wants math/arithmetic/accounting analysis.
# Kept deliberately narrow — false positives send harmless traffic to the
# auditor; false negatives degrade to general Q&A which is also reasonable.
_MATH_KEYWORDS = re.compile(
    r"\b("
    r"math|maths|arithmetic|calculation|calculate|calculating|"
    r"sum|sums|total|totals|subtotal|"
    r"tally|tallies|add\s+up|adds\s+up|"
    r"percentage|percentages|"
    r"balance|balances|"
    r"invoice|invoices|ledger|accounting|accounts|financial|"
    r"audit|auditing|reconcile|reconciling|"
    r"figure|figures|number|numbers"
    r")\b",
    re.IGNORECASE,
)


def is_math_intent(user_message: str) -> bool:
    """Return True if the prompt reads like a math/accounting query.

    Simple keyword match — the orchestrator's top-level LLM has already routed
    the request to pdf_question/pdf_review based on question vs review intent;
    this just decides whether to pull in the math specialist inside the
    meta-agent. Good enough for an MVP; can upgrade to a tiny classifier later.
    """
    if not user_message:
        return False
    return _MATH_KEYWORDS.search(user_message) is not None


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
