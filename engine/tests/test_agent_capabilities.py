"""Lock the MCP capabilities manifest wire shape.

Exercises the real ``GET /api/v1/agents/capabilities`` endpoint (so it covers the
actual startup wiring of ``app.state.agent_descriptors``) and pins every
capability's id, metadata, and Pydantic-derived input schema. The manifest is
built by flattening each agent's ``describe()`` rows; this suite is the guard
that the derived manifest never drifts from the published contract.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import pytest
from conftest import build_app_settings
from fastapi.testclient import TestClient
from pydantic import BaseModel

from stirling.api import app
from stirling.config import load_settings
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


@pytest.fixture
def manifest() -> Iterator[dict[str, Any]]:
    # Force test settings for the lifespan (other suites pop this override, so we
    # can't rely on a module-level set), then enter the client as a context manager
    # so the lifespan runs and populates ``app.state.agent_descriptors`` — the
    # manifest is built from that real startup registration, not a duplicated list.
    app.dependency_overrides[load_settings] = build_app_settings
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/agents/capabilities")
    finally:
        app.dependency_overrides.pop(load_settings, None)
    assert response.status_code == 200
    yield response.json()


@dataclass(frozen=True)
class _Expected:
    description: str
    mode: str
    required_scope: str
    route: str
    input_model: type[BaseModel]


# Expected per-capability metadata, keyed by id. Order-independent on purpose —
# Java consumes the manifest as a keyed operation registry, not a sequence.
_EXPECTED: dict[str, _Expected] = {
    "pdf-question-answer": _Expected(
        description="Answer a natural-language question about a PDF document.",
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/pdf-question",
        input_model=PdfQuestionRequest,
    ),
    "pdf-edit-plan": _Expected(
        description=(
            "Produce an edit plan (a structured sequence of PDF operations) from a"
            " natural-language edit request. The plan is executed by Java through the job"
            " pipeline; this capability does not modify files itself."
        ),
        mode="async",
        required_scope="mcp.tools.write",
        route="/api/v1/pdf-edit",
        input_model=PdfEditRequest,
    ),
    "agent-draft": _Expected(
        description=(
            "Draft a structured agent specification from a free-text description of the task the user wants automated."
        ),
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/agents/draft",
        input_model=AgentDraftRequest,
    ),
    "agent-revise": _Expected(
        description="Revise an existing draft agent specification based on user feedback or constraint changes.",
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/agents/revise",
        input_model=AgentRevisionRequest,
    ),
    "math-audit-examine": _Expected(
        description=(
            "Examine a folio manifest of financial / numeric documents and surface the"
            " evidence that needs to be checked for arithmetic consistency."
        ),
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/math-auditor-agent/examine",
        input_model=FolioManifest,
    ),
    "math-audit-deliberate": _Expected(
        description=(
            "Render a deliberated verdict on a single piece of evidence the examine step"
            " surfaced (does the arithmetic check out, with what caveats)."
        ),
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/ai/math-auditor-agent/deliberate",
        input_model=Evidence,
    ),
    "pdf-comment-generate": _Expected(
        description="Generate inline review comments for a PDF document.",
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/pdf-comment/generate",
        input_model=PdfCommentRequest,
    ),
    "agent-next-action": _Expected(
        description=(
            "Decide the next execution step for an in-progress agent workflow. Returns a"
            " ToolCall, Completed, or CannotContinue action."
        ),
        mode="sync",
        required_scope="mcp.tools.read",
        route="/api/v1/agents/next-action",
        input_model=AgentExecutionRequest,
    ),
}


def test_manifest_version(manifest: dict[str, Any]) -> None:
    assert manifest["version"] == 1


def test_manifest_exposes_exactly_the_expected_capabilities(manifest: dict[str, Any]) -> None:
    ids = {c["id"] for c in manifest["capabilities"]}
    assert ids == set(_EXPECTED)


def test_manifest_capability_metadata_and_schema(manifest: dict[str, Any]) -> None:
    by_id = {c["id"]: c for c in manifest["capabilities"]}
    for cap_id, expected in _EXPECTED.items():
        entry = by_id[cap_id]
        assert entry["description"] == expected.description, cap_id
        assert entry["mode"] == expected.mode, cap_id
        assert entry["required_scope"] == expected.required_scope, cap_id
        assert entry["route"] == expected.route, cap_id
        assert entry["input_schema"] == expected.input_model.model_json_schema(), cap_id
