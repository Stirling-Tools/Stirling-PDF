"""
Math-auditor presentation helpers — used by ``delegate_pdf_question`` and
``delegate_pdf_review`` to decide when to consult the math auditor and how to
render its :class:`Verdict` back to the user.

Kept separate from the specialist (``agents/ledger/``) so presentation never
leaks into the math analysis itself.
"""

from __future__ import annotations

import json
import re
from typing import Any

from stirling.contracts import (
    OrchestratorRequest,
    ToolReportArtifact,
    Verdict,
)
from stirling.contracts.ledger import Discrepancy, Severity
from stirling.models.tool_models import CommentSpec, ToolEndpoint

# ---------------------------------------------------------------------------
# Intent detection
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Report-artifact extraction (second-turn entry after the plan runs)
# ---------------------------------------------------------------------------


def extract_math_verdict(request: OrchestratorRequest) -> Verdict | None:
    """Find a math-auditor Verdict in the request's artifacts, if any.

    Meta-agents call this on resume to detect whether the specialist has
    already run. Returns ``None`` on the first turn (before the plan fires)
    and a hydrated :class:`Verdict` on the resume turn.
    """
    for artifact in request.artifacts:
        if not isinstance(artifact, ToolReportArtifact):
            continue
        if artifact.source_tool != ToolEndpoint.MATH_AUDITOR_AGENT:
            continue
        try:
            return Verdict.model_validate(artifact.report)
        except Exception:  # noqa: BLE001 — malformed report degrades gracefully
            return None
    return None


# ---------------------------------------------------------------------------
# Presentation — prose answer (pdf_question) and comment specs (pdf_review)
# ---------------------------------------------------------------------------


def verdict_to_prose(verdict: Verdict) -> str:
    """Render a Verdict as a short chat-friendly answer.

    Deterministic composition — no LLM needed. If there are few discrepancies
    we list them; if there are many we summarise counts + show a sample.
    """
    discrepancies = verdict.discrepancies or []
    errors = [d for d in discrepancies if d.severity == Severity.ERROR]
    warnings = [d for d in discrepancies if d.severity == Severity.WARNING]

    if verdict.clean and not discrepancies:
        return (
            f"No mathematical issues found across {len(verdict.pages_examined)} "
            f"page(s). {verdict.summary}"
        )

    lines: list[str] = [verdict.summary.strip()] if verdict.summary else []
    if errors or warnings:
        parts = []
        if errors:
            parts.append(f"{len(errors)} error{'s' if len(errors) != 1 else ''}")
        if warnings:
            parts.append(f"{len(warnings)} warning{'s' if len(warnings) != 1 else ''}")
        lines.append("Found " + " and ".join(parts) + ":")

    # Show up to the first 5 in detail; summarise the rest.
    shown = discrepancies[:5]
    for d in shown:
        lines.append(f"- Page {d.page + 1}: {_discrepancy_one_liner(d)}")
    if len(discrepancies) > len(shown):
        lines.append(f"  …and {len(discrepancies) - len(shown)} more.")
    return "\n".join(lines)


def _discrepancy_one_liner(d: Discrepancy) -> str:
    head = d.description.strip().rstrip(".") if d.description else "Discrepancy"
    if d.stated and d.expected:
        return f"{head} (stated {d.stated}, expected {d.expected})"
    return head


# ---------------------------------------------------------------------------
# Verdict → CommentSpec list (pdf_review path)
# ---------------------------------------------------------------------------

# Right-margin anchor placement — same layout rules the Java projector used
# before we moved this into Python. A4/Letter portrait assumed.
_ICON_X = 520.0
_ICON_Y_TOP = 770.0
_ICON_Y_STRIDE = 28.0
_ICON_SIZE = 20.0

_DEFAULT_AUTHOR = "Stirling Math Auditor"


def verdict_to_comment_specs(verdict: Verdict) -> list[CommentSpec]:
    """Project the verdict's discrepancies onto the source PDF as sticky-note specs.

    Each discrepancy becomes one sticky note at a fixed right-margin position
    on its page; multiple notes on the same page stack vertically so they
    don't overlap.
    """
    specs: list[CommentSpec] = []
    per_page_index: dict[int, int] = {}
    for d in verdict.discrepancies or []:
        if d is None:
            continue
        stack_index = per_page_index.get(d.page, 0)
        per_page_index[d.page] = stack_index + 1
        y = _ICON_Y_TOP - stack_index * _ICON_Y_STRIDE
        specs.append(
            CommentSpec(
                page_index=d.page,
                x=_ICON_X,
                y=y,
                width=_ICON_SIZE,
                height=_ICON_SIZE,
                text=_comment_body(d),
                author=_DEFAULT_AUTHOR,
                subject=_comment_subject(d),
            )
        )
    return specs


def verdict_to_add_comments_payload(verdict: Verdict) -> str:
    """Build the JSON-encoded ``comments`` string the add-comments tool expects."""
    specs = verdict_to_comment_specs(verdict)
    # Use the shared ApiModel serialisation so aliases (camelCase) match Java.
    serialised: list[dict[str, Any]] = [
        spec.model_dump(by_alias=True, exclude_none=True) for spec in specs
    ]
    return json.dumps(serialised)


def _comment_body(d: Discrepancy) -> str:
    label = _severity_label(d.severity)
    desc = d.description.strip() if d.description else ""
    context = d.context.strip() if d.context else ""
    head = desc or context or "See details."
    lines = [f"{label} {head}"]
    if (d.stated and d.stated.strip()) or (d.expected and d.expected.strip()):
        lines.append("")
        lines.append(f"Stated: {d.stated or '—'}")
        lines.append(f"Expected: {d.expected or '—'}")
    return "\n".join(lines)


def _comment_subject(d: Discrepancy) -> str:
    kind = d.kind.value if d.kind is not None else "Discrepancy"
    return f"{_severity_label(d.severity)} {kind}"


def _severity_label(severity: Severity | None) -> str:
    if severity == Severity.ERROR:
        return "Error:"
    if severity == Severity.WARNING:
        return "Warning:"
    return "Issue:"
