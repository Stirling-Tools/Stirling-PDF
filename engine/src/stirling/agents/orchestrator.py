from __future__ import annotations

import logging

from pydantic import ConfigDict, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.output_mode import output_retries
from stirling.agents.registry import AgentDescriptor, OrchestratorRoute
from stirling.contracts import (
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
    format_conversation_history,
    format_file_names,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class _RouteDecision(ApiModel):
    # Local models add stray tool args and send null for optional fields; tolerate both.
    model_config = ConfigDict(extra="ignore")
    capability: SupportedCapability
    message: str | None = Field(
        default=None,
        description="Only when no capability fits (capability=orchestrate): a short, helpful message for the user.",
    )


def _build_router_prompt(routes: list[OrchestratorRoute]) -> str:
    """Router prompt derived from the registry: one bullet per routable capability plus the
    ``orchestrate`` escape hatch. The routable set is never hand-maintained here."""
    options = "\n".join(f"- {route.capability.value}: {route.description}" for route in routes)
    return (
        "You are the top-level router. Choose exactly one capability that best handles the request:\n"
        f"{options}\n"
        f"- {SupportedCapability.ORCHESTRATE.value}: none of the above fit, or the user asks about the "
        "assistant itself; put a helpful message in 'message'.\n"
        "Respond with the capability and (only for orchestrate) a message."
    )


class OrchestratorAgent:
    """Classifies each request to one registered capability, then dispatches to its delegate.

    A single provider-agnostic classifier replaces per-provider routing: ``structured_output``
    delivers the decision via a tool call on local models and native json-schema elsewhere
    (see ``agents.output_mode``). Both the option list and the prompt are derived from the
    registry, so adding a routable agent is a ``describe()`` change only.
    """

    def __init__(self, runtime: AppRuntime, descriptors: list[AgentDescriptor]) -> None:
        self.runtime = runtime
        routes = [d.orchestrator for d in descriptors if d.orchestrator is not None]
        self._delegates_by_capability: dict[SupportedCapability, OrchestratorRoute] = {
            route.capability: route for route in routes
        }
        self._router = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput([_RouteDecision]),
            # Local models can still need extra output-validation retries. No-op for real providers.
            retries=output_retries(runtime.settings.chat_provider),
            system_prompt=_build_router_prompt(routes),
            model_settings=runtime.fast_model_settings,
        )

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        logger.info(
            "[orchestrator] handle: files=%s resume_with=%s artifacts=%s msg=%r",
            [file.name for file in request.files],
            request.resume_with,
            [type(a).__name__ for a in request.artifacts],
            request.user_message,
        )
        if request.resume_with is not None:
            return await self._resume(request, request.resume_with)
        result = await self._router.run(self._build_prompt(request))
        return await self._dispatch(result.output, request)

    async def _dispatch(self, decision: _RouteDecision, request: OrchestratorRequest) -> OrchestratorResponse:
        route = self._delegates_by_capability.get(decision.capability)
        if route is None:
            # ``orchestrate`` (or any non-routable pick) means "nothing fits" — the escape hatch.
            logger.info("[orchestrator] routed -> unsupported (%s)", decision.capability)
            return UnsupportedCapabilityResponse(
                capability=SupportedCapability.ORCHESTRATE.value,
                message=decision.message or "I can't help with that request.",
            )
        logger.info("[orchestrator] routed -> %s", decision.capability)
        return await route.orchestrate(request)

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path back to the right delegate without consulting the LLM.

        Also the entry point for the *multi-turn* flow where a delegate emits a plan with
        ``resume_with`` set — Java runs the plan, captures any tool reports as artifacts, and
        re-enters here so the delegate can digest the reports.
        """
        route = self._delegates_by_capability.get(capability)
        if route is None:
            raise ValueError(f"Cannot resume orchestrator with capability: {capability}")
        return await route.orchestrate(request)

    def _build_prompt(self, request: OrchestratorRequest) -> str:
        artifact_summary = self._describe_artifacts(request)
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"User message: {request.user_message}\n"
            f"Files: {format_file_names(request.files)}\n"
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
