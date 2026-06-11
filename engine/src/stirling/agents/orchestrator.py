from __future__ import annotations

import logging
from typing import Literal

from pydantic import ConfigDict, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput, ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents._registry import AgentDescriptor, OrchestratorDeps, OrchestratorRoute
from stirling.agents.output_mode import output_retries, uses_tool_output
from stirling.agents.pdf_create import PdfCreateAgent
from stirling.contracts import (
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
    format_conversation_history,
    format_file_names,
)
from stirling.contracts.pdf_create import PdfCreateOrchestrateResponse
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


# Enum routing for Ollama/custom local models: they pass the user message as args to the
# zero-arg tool delegates below, which reject it, so pick a capability by name and dispatch in Python.
_RouteCapability = Literal["pdf_edit", "pdf_question", "user_spec", "pdf_review", "pdf_create", "unsupported"]

# Router capability name -> the SupportedCapability keying its registry delegate. pdf_create is
# handled inline (below) and unsupported has no delegate, so neither appears here.
_ROUTE_TO_CAPABILITY: dict[str, SupportedCapability] = {
    "pdf_edit": SupportedCapability.PDF_EDIT,
    "pdf_question": SupportedCapability.PDF_QUESTION,
    "user_spec": SupportedCapability.AGENT_DRAFT,
    "pdf_review": SupportedCapability.PDF_REVIEW,
}


class _RouteDecision(ApiModel):
    # Local models add stray tool args and send null for optional fields; tolerate both.
    model_config = ConfigDict(extra="ignore")
    capability: _RouteCapability
    message: str | None = Field(
        default=None,
        description="Only for capability='unsupported': a short, helpful message to show the user.",
    )


_ROUTER_SYSTEM_PROMPT = (
    "You are the top-level router. Choose exactly one capability that best handles the request:\n"
    "- pdf_edit: modify or convert one or more attached PDFs.\n"
    "- pdf_question: answer questions about the contents of the attached PDFs.\n"
    "- user_spec: create or define an agent spec.\n"
    "- pdf_review: return the PDF with review comments/annotations attached.\n"
    "- pdf_create: generate a NEW document from scratch (invoice, report, letter) - no input file.\n"
    "- unsupported: none of the above fit, or the user asks about the assistant itself; put a "
    "helpful message in 'message'.\n"
    "Respond with the capability and (only for unsupported) a message."
)


class OrchestratorAgent:
    def __init__(self, runtime: AppRuntime, descriptors: list[AgentDescriptor]) -> None:
        self.runtime = runtime
        routes = [d.orchestrator for d in descriptors if d.orchestrator is not None]
        # Only re-entrant delegates can be resumed; canned ones are routable but never resumed,
        # matching the previous explicit guard.
        self._resumable_by_capability: dict[SupportedCapability, OrchestratorRoute] = {
            route.capability: route for route in routes if route.resumable
        }
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=[
                *(route.tool_output() for route in routes),
                ToolOutput(
                    self.delegate_pdf_create,
                    name="delegate_pdf_create",
                    description=(
                        "Delegate requests to create a new PDF document from scratch based on a"
                        " description. Use this when the user wants to generate a new document"
                        " (e.g. 'create an invoice', 'write a report', 'make a contract',"
                        " 'draft a letter'). No input file is required."
                    ),
                ),
                ToolOutput(
                    self.unsupported_capability,
                    name="unsupported_capability",
                    description="Return this when none of the delegate outputs fit the request.",
                ),
            ],
            # Local models pick a delegate less reliably; extra retries. No-op for real providers.
            retries=output_retries(runtime.settings.chat_provider),
            deps_type=OrchestratorDeps,
            system_prompt=(
                "You are the top-level orchestrator. "
                "Choose exactly one output function that best handles the request. "
                "Consult each delegate tool's description and pick the single best fit. "
                "Use unsupported_capability when the user asks about the assistant itself "
                "or when none of the other outputs fit; supply a helpful message."
            ),
            model_settings=runtime.fast_model_settings,
        )
        # Local models can't drive the zero-arg tool delegates; route by name instead (#6163: unify these paths).
        self._route_via_enum = uses_tool_output(runtime.settings.chat_provider)
        # The router has no tools, so NativeOutput works on Ollama here; a lone output tool
        # would tempt a local model to answer in plain text and never call it.
        self._router = (
            Agent(
                model=runtime.fast_model,
                output_type=NativeOutput([_RouteDecision]),
                retries=output_retries(runtime.settings.chat_provider),
                system_prompt=_ROUTER_SYSTEM_PROMPT,
                model_settings=runtime.fast_model_settings,
            )
            if self._route_via_enum
            else None
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
        if self._router is not None:
            return await self._route_and_dispatch(request)
        result = await self.agent.run(
            self._build_prompt(request),
            deps=OrchestratorDeps(runtime=self.runtime, request=request),
        )
        logger.info("[orchestrator] routed -> %s", type(result.output).__name__)
        return result.output

    async def _route_and_dispatch(self, request: OrchestratorRequest) -> OrchestratorResponse:
        """Local-model routing: pick a capability by name, then dispatch in Python."""
        assert self._router is not None
        result = await self._router.run(self._build_prompt(request))
        decision = result.output
        logger.info("[orchestrator] enum-routed -> %s", decision.capability)
        if decision.capability == "unsupported":
            return UnsupportedCapabilityResponse(
                capability="orchestrate",
                message=decision.message or "I can't help with that request.",
            )
        if decision.capability == "pdf_create":
            return await self._run_pdf_create(request)
        return await self._resumable_by_capability[_ROUTE_TO_CAPABILITY[decision.capability]].orchestrate(request)

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path back to the right delegate without consulting the LLM.

        Also the entry point for the *multi-turn* flow where a delegate emits a plan with
        ``resume_with`` set — Java runs the plan, captures any tool reports as artifacts, and
        re-enters here so the delegate can digest the reports.
        """
        route = self._resumable_by_capability.get(capability)
        if route is None:
            raise ValueError(f"Cannot resume orchestrator with capability: {capability}")
        return await route.orchestrate(request)

    async def delegate_pdf_create(self, ctx: RunContext[OrchestratorDeps]) -> PdfCreateOrchestrateResponse:
        return await self._run_pdf_create(ctx.deps.request)

    async def _run_pdf_create(self, request: OrchestratorRequest) -> PdfCreateOrchestrateResponse:
        return await PdfCreateAgent(self.runtime).orchestrate(request)

    async def unsupported_capability(
        self,
        ctx: RunContext[OrchestratorDeps],
        capability: str,
        message: str,
    ) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability=capability, message=message)

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
