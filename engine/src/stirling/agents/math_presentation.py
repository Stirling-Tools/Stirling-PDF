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

from pydantic import Field

from stirling.contracts import (
    OrchestratorRequest,
    ToolReportArtifact,
    Verdict,
)
from stirling.contracts.ledger import Discrepancy, Severity
from stirling.models.base import ApiModel
from stirling.models.tool_models import ToolEndpoint


class CommentSpec(ApiModel):
    """Sticky-note spec serialised into the ``comments`` JSON string sent to
    ``/api/v1/misc/add-comments``. Kept local to this module — it's purely the
    engine-side structured representation of each discrepancy we flag on the PDF,
    and the backend's tool contract takes the JSON string form, not this type.
    """

    page_index: int = Field(description="0-indexed page number.")
    x: float = Field(description="Bottom-left x coord of the icon (PDF user-space).")
    y: float = Field(description="Bottom-left y coord of the icon (PDF user-space).")
    width: float = Field(description="Width of the icon in user-space units.")
    height: float = Field(description="Height of the icon in user-space units.")
    text: str = Field(description="Comment body shown in the popup.")
    author: str | None = Field(default=None)
    subject: str | None = Field(default=None)
    anchor_text: str | None = Field(
        default=None,
        description=(
            "Optional text snippet to locate on the page; when set, the server anchors"
            " the icon at the first matching line and ignores the x/y coords."
        ),
    )


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
        return f"No mathematical issues found across {len(verdict.pages_examined)} page(s). {verdict.summary}"

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

# Fallback right-margin placement — used only when the discrepancy has no
# usable anchor text (empty stated/context) or when the server fails to
# locate the anchor on the page. A4/Letter portrait assumed.
_ICON_X = 520.0
_ICON_Y_TOP = 770.0
_ICON_Y_STRIDE = 28.0
_ICON_SIZE = 20.0

_DEFAULT_AUTHOR = "Stirling Math Auditor"


def verdict_to_comment_specs(verdict: Verdict) -> list[CommentSpec]:
    """Project the verdict's discrepancies onto the source PDF as sticky-note specs.

    Each discrepancy becomes one sticky note anchored at the line that contains the
    discrepancy's ``stated`` value (or ``context`` when no stated value is available).
    Falls back to a stacked right-margin position when no anchor text is usable.
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
                anchor_text=_anchor_text_for(d),
            )
        )
    return specs


def _anchor_text_for(d: Discrepancy) -> str | None:
    """Pick the best snippet for the server to locate on the page.

    Prefer ``stated`` (the literal value we flagged) since it's the most
    distinctive short string on the line. Fall back to ``context`` (which
    often quotes the surrounding phrase) when stated is absent.
    """
    stated = (d.stated or "").strip()
    if stated:
        return stated
    context = (d.context or "").strip()
    return context or None


def verdict_to_add_comments_payload(verdict: Verdict) -> str:
    """Build the JSON-encoded ``comments`` string the add-comments tool expects."""
    specs = verdict_to_comment_specs(verdict)
    # Use the shared ApiModel serialisation so aliases (camelCase) match Java.
    serialised: list[dict[str, Any]] = [spec.model_dump(by_alias=True, exclude_none=True) for spec in specs]
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
