"""
Curated registry of agent capabilities the MCP server (Java side) is allowed to publish.

Internal sub-agents (currently only ``ExecutionPlanningAgent`` - it lives behind the orchestrator
and has no end-user-facing API surface) are intentionally absent. The handoff spec calls for
"user-facing" capabilities only; revisit this list when adding a new agent and ask whether MCP
clients should be able to invoke it directly.

The Java side pulls ``/api/v1/agents/capabilities`` once at boot and again every few minutes; the
manifest is the authoritative source for the ``stirling_ai`` MCP tool's operation enum.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from stirling.contracts import (
    AgentDraftRequest,
    AgentExecutionRequest,
    AgentRevisionRequest,
    Evidence,
    FolioManifest,
    PdfCommentRequest,
    PdfEditRequest,
    PdfQuestionRequest,
)


@dataclass(frozen=True)
class AgentCapability:
    """One row in the curated manifest.

    Attributes:
        id: stable capability identifier (used as the operation enum value in
            ``stirling_ai``). Avoid renaming - clients persist these.
        description: one-line human-friendly summary shown inside MCP tool descriptions.
        input_model: Pydantic class whose JSON Schema becomes the capability's
            ``input_schema``. Auto-derived; do not hand-write schemas.
        mode: ``"sync"`` if the capability returns content inline, ``"async"`` if it returns a
            plan that Java executes via the job pipeline.
        required_scope: coarse OAuth scope. ``mcp.tools.read`` for pure-read capabilities
            (Q&A, audits) and ``mcp.tools.write`` for anything that yields a plan / file.
        route: HTTP path Java POSTs to when invoking this capability. When a capability does
            not have a stable per-agent route yet, use the generic invoke fallback at
            ``/api/v1/agents/invoke/{id}``.
    """

    id: str
    description: str
    input_model: type[BaseModel]
    mode: str
    required_scope: str
    route: str


EXPOSED_CAPABILITIES: list[AgentCapability] = [
    AgentCapability(
        id="pdf-question-answer",
        description="Answer a natural-language question about a PDF document.",
        input_model=PdfQuestionRequest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/pdf-question",
    ),
    AgentCapability(
        id="pdf-edit-plan",
        description=(
            "Produce an edit plan (a structured sequence of PDF operations) from a"
            " natural-language edit request. The plan is executed by Java through the job"
            " pipeline; this capability does not modify files itself."
        ),
        input_model=PdfEditRequest,
        mode="async",
        required_scope="mcp.tools.write",
        route="/api/v1/pdf-edit",
    ),
    AgentCapability(
        id="agent-draft",
        description=(
            "Draft a structured agent specification from a free-text description of the task the user wants automated."
        ),
        input_model=AgentDraftRequest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/agents/draft",
    ),
    AgentCapability(
        id="agent-revise",
        description=("Revise an existing draft agent specification based on user feedback or constraint changes."),
        input_model=AgentRevisionRequest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/agents/revise",
    ),
    AgentCapability(
        id="math-audit-examine",
        description=(
            "Examine a folio manifest of financial / numeric documents and surface the"
            " evidence that needs to be checked for arithmetic consistency."
        ),
        input_model=FolioManifest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/math-auditor-agent/examine",
    ),
    AgentCapability(
        id="math-audit-deliberate",
        description=(
            "Render a deliberated verdict on a single piece of evidence the examine step"
            " surfaced (does the arithmetic check out, with what caveats)."
        ),
        input_model=Evidence,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/math-auditor-agent/deliberate",
    ),
    AgentCapability(
        id="pdf-comment-generate",
        description="Generate inline review comments for a PDF document.",
        input_model=PdfCommentRequest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/pdf-comment/generate",
    ),
    AgentCapability(
        id="agent-next-action",
        description=(
            "Decide the next execution step for an in-progress agent workflow. Returns a"
            " ToolCall, Completed, or CannotContinue action."
        ),
        input_model=AgentExecutionRequest,
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/agents/next-action",
    ),
]


def manifest_payload() -> dict[str, Any]:
    """Serialize the curated registry to the wire shape consumed by Java.

    Schema is derived from ``input_model.model_json_schema()`` so we never hand-write JSON
    Schema - the Pydantic model is the single source of truth.
    """
    items: list[dict[str, Any]] = []
    for cap in EXPOSED_CAPABILITIES:
        items.append(
            {
                "id": cap.id,
                "description": cap.description,
                "input_schema": cap.input_model.model_json_schema(),
                "mode": cap.mode,
                "required_scope": cap.required_scope,
                "route": cap.route,
            }
        )
    return {"version": 1, "capabilities": items}
