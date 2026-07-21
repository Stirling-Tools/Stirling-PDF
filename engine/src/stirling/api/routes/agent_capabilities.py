"""GET ``/api/v1/agents/capabilities`` - the manifest the Java MCP server pulls at boot."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from stirling.api.agent_capabilities import manifest_payload

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("/capabilities")
def get_capabilities() -> dict[str, Any]:
    """Return the curated agent capabilities manifest.

    Gated by ``EngineSharedSecretMiddleware`` when the ``STIRLING_ENGINE_SHARED_SECRET`` env var
    is configured. In dev/local mode (no secret set), the endpoint is open - the engine binds to
    localhost only by default, so this is acceptable while iterating.
    """
    return manifest_payload()
