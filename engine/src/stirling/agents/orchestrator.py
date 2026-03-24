from __future__ import annotations

from stirling.contracts import OrchestratorRequest, OrchestratorResponse, UnsupportedCapabilityResponse
from stirling.services.runtime import AppRuntime


class OrchestratorAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        capability = request.capability.value if request.capability else "unknown"
        return UnsupportedCapabilityResponse(
            capability=capability,
            message="Orchestrator routing is not implemented yet.",
        )
