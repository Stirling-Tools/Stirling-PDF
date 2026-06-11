"""GET ``/api/v1/agents/capabilities`` - the manifest the Java MCP server pulls at boot."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from stirling.api.agent_capabilities import manifest_payload

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("/capabilities")
def get_capabilities(request: Request) -> dict[str, Any]:
    """Return the agent capabilities manifest, derived from the startup registry.

    Gated by ``EngineSharedSecretMiddleware`` when the ``STIRLING_ENGINE_SHARED_SECRET`` env var
    is configured. In dev/local mode (no secret set), the endpoint is open - the engine binds to
    localhost only by default, so this is acceptable while iterating.
    """
    return manifest_payload(request.app.state.agent_descriptors)
