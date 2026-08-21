from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, assert_never

from pydantic import ConfigDict, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput, ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents.output_mode import output_retries, uses_tool_output
from stirling.agents.pdf_create import PdfCreateAgent
from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.pdf_review import PdfReviewAgent
from stirling.agents.user_spec import UserSpecAgent
from stirling.contracts import (
    AgentDraftWorkflowResponse,
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfEditResponse,
    PdfQuestionOrchestrateResponse,
    PdfReviewOrchestrateResponse,
    SupportedCapability,
    UnsupportedCapabilityResponse,
    format_conversation_history,
    format_file_names,
)
from stirling.contracts.pdf_create import PdfCreateOrchestrateResponse
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrchestratorDeps:
    runtime: AppRuntime
    request: OrchestratorRequest


# Enum routing for Ollama/custom local models: they pass the user message as args to the
# zero-arg tool delegates below, which reject it, so pick a capability by name and dispatch in Python.
_RouteCapability = Literal["pdf_edit", "pdf_question", "user_spec", "pdf_review", "pdf_create", "unsupported"]


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
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=[
                ToolOutput(
                    self.delegate_pdf_edit,
                    name="delegate_pdf_edit",
                    description="Delegate requests to modify or convert PDFs and return the PDF edit result.",
                ),
                ToolOutput(
                    self.delegate_pdf_question,
                    name="delegate_pdf_question",
                    description="Delegate questions about PDF contents and return the PDF question result.",
                ),
                ToolOutput(
                    self.delegate_user_spec,
                    name="delegate_user_spec",
                    description="Delegate requests to create or revise a user agent spec and return the draft result.",
                ),
                ToolOutput(
                    self.delegate_pdf_review,
                    name="delegate_pdf_review",
                    description=(
                        "Delegate requests to review a PDF and leave review comments, notes, or"
                        " sticky-note annotations on the document itself. Use this when the user"
                        " wants the PDF returned with comments attached (e.g. 'review this',"
                        " 'add review comments', 'flag unclear sentences', 'annotate with"
                        " feedback')."
                    ),
                ),
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
                "Use delegate_pdf_edit for any request to modify or convert one or more PDFs. "
                "Use delegate_pdf_question for questions about the contents of the attached PDFs. "
                "Use delegate_user_spec for requests to create or define an agent spec. "
                "Use delegate_pdf_review when the user wants the PDF returned with review"
                " comments attached — anything like 'review this', 'annotate with comments',"
                " 'leave feedback on the PDF'. "
                "Use delegate_pdf_create when the user wants to generate a new document from"
                " scratch with no input file — invoices, reports, letters, contracts, etc. "
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
        match decision.capability:
            case "pdf_edit":
                return await self._run_pdf_edit(request)
            case "pdf_question":
                return await self._run_pdf_question(request)
            case "user_spec":
                return await self._run_agent_draft(request)
            case "pdf_review":
                return await self._run_pdf_review(request)
            case "pdf_create":
                return await self._run_pdf_create(request)
            case "unsupported":
                return UnsupportedCapabilityResponse(
                    capability="orchestrate",
                    message=decision.message or "I can't help with that request.",
                )
            case _ as unreachable:
                assert_never(unreachable)

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path to get back to the correct endpoint without having to call AI.

        Also the entry point for the *multi-turn* flow where a delegate emits a plan with
        ``resume_with`` set — Java runs the plan, captures any tool reports as artifacts, and
        re-enters via this method so the delegate can digest the reports.
        """
        match capability:
            case SupportedCapability.PDF_QUESTION:
                return await self._run_pdf_question(request)
            case SupportedCapability.PDF_REVIEW:
                return await self._run_pdf_review(request)
            case SupportedCapability.PDF_EDIT:
                return await self._run_pdf_edit(request)
            case SupportedCapability.AGENT_DRAFT:
                return await self._run_agent_draft(request)
            case SupportedCapability.PDF_CREATE:
                return await self._run_pdf_create(request)
            case (
                SupportedCapability.ORCHESTRATE
                | SupportedCapability.AGENT_REVISE
                | SupportedCapability.AGENT_NEXT_ACTION
                | SupportedCapability.MATH_AUDITOR_AGENT
            ):
                raise ValueError(f"Cannot resume orchestrator with capability: {capability}")
            case _ as unreachable:
                assert_never(unreachable)

    async def delegate_pdf_edit(self, ctx: RunContext[OrchestratorDeps]) -> PdfEditResponse:
        return await self._run_pdf_edit(ctx.deps.request)

    async def _run_pdf_edit(self, request: OrchestratorRequest) -> PdfEditResponse:
        return await PdfEditAgent(self.runtime).orchestrate(request)

    async def delegate_pdf_question(self, ctx: RunContext[OrchestratorDeps]) -> PdfQuestionOrchestrateResponse:
        return await self._run_pdf_question(ctx.deps.request)

    async def _run_pdf_question(self, request: OrchestratorRequest) -> PdfQuestionOrchestrateResponse:
        return await PdfQuestionAgent(self.runtime).orchestrate(request)

    async def delegate_user_spec(self, ctx: RunContext[OrchestratorDeps]) -> AgentDraftWorkflowResponse:
        return await self._run_agent_draft(ctx.deps.request)

    async def _run_agent_draft(self, request: OrchestratorRequest) -> AgentDraftWorkflowResponse:
        return await UserSpecAgent(self.runtime).orchestrate(request)

    async def delegate_pdf_review(self, ctx: RunContext[OrchestratorDeps]) -> PdfReviewOrchestrateResponse:
        return await self._run_pdf_review(ctx.deps.request)

    async def _run_pdf_review(self, request: OrchestratorRequest) -> PdfReviewOrchestrateResponse:
        return await PdfReviewAgent(self.runtime).orchestrate(request)

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
