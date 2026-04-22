from __future__ import annotations

import logging

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents._registry import DelegatableAgent, OrchestratorDeps
from stirling.contracts import (
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
    format_conversation_history,
)
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class OrchestratorAgent:
    def __init__(self, runtime: AppRuntime, delegates: list[DelegatableAgent]) -> None:
        self.runtime = runtime
        self._delegates_by_capability = {d.capability: d for d in delegates}
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=[
                *(d.tool_output for d in delegates),
                ToolOutput(
                    self.unsupported_capability,
                    name="unsupported_capability",
                    description="Return this when none of the delegate outputs fit the request.",
                ),
            ],
            deps_type=OrchestratorDeps,
            system_prompt=(
                "You are the top-level orchestrator. "
                "Choose exactly one output function that best handles the request. "
                "Consult each tool's description to pick the most appropriate one. "
                "Use unsupported_capability only when none of the other outputs fit."
            ),
            model_settings=runtime.fast_model_settings,
        )

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        logger.info(
            "[orchestrator] handle: files=%s resume_with=%s artifacts=%s msg=%r",
            request.file_names,
            request.resume_with,
            [type(a).__name__ for a in request.artifacts],
            request.user_message,
        )
        if request.resume_with is not None:
            return await self._resume(request, request.resume_with)
        result = await self.agent.run(
            self._build_prompt(request),
            deps=OrchestratorDeps(runtime=self.runtime, request=request),
        )
        logger.info("[orchestrator] routed -> %s", type(result.output).__name__)
        return result.output

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path: dispatch directly to a registered delegate without consulting the LLM."""
        delegate = self._delegates_by_capability.get(capability)
        if delegate is None:
            raise ValueError(f"Cannot resume orchestrator with capability: {capability}")
        return await delegate.run(request)

    async def unsupported_capability(
        self,
        ctx: RunContext[OrchestratorDeps],
        capability: str,
        message: str,
    ) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability=capability, message=message)

    def _build_prompt(self, request: OrchestratorRequest) -> str:
        artifact_summary = self._describe_artifacts(request)
        file_names = ", ".join(request.file_names) if request.file_names else "Unknown files"
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"User message: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Available artifacts:\n{artifact_summary}"
        )

    def _describe_artifacts(self, request: OrchestratorRequest) -> str:
        if not request.artifacts:
            return "- none"

        descriptions: list[str] = []
        for artifact in request.artifacts:
            if isinstance(artifact, ExtractedTextArtifact):
                total_pages = sum(len(f.pages) for f in artifact.files)
                file_names = [f.file_name for f in artifact.files]
                descriptions.append(f"- extracted_text: {total_pages} pages from {file_names}")
                continue
            descriptions.append("- unknown artifact")
        return "\n".join(descriptions)
