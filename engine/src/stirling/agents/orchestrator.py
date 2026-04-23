from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import assert_never

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.summary import SummaryAgent
from stirling.agents.user_spec import UserSpecAgent
from stirling.contracts import (
    AgentDraftRequest,
    AgentDraftWorkflowResponse,
    ExtractedTextArtifact,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfEditRequest,
    PdfEditResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    SummaryRequest,
    SummaryResponse,
    SupportedCapability,
    ToolOperationStep,
    UnsupportedCapabilityResponse,
    format_conversation_history,
    format_file_names,
)
from stirling.contracts.pdf_edit import EditPlanResponse
from stirling.models.agent_tool_models import AgentToolId, MathAuditorAgentParams
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OrchestratorDeps:
    runtime: AppRuntime
    request: OrchestratorRequest


class OrchestratorAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.fast_model,
            output_type=[
                ToolOutput(
                    self.delegate_pdf_edit,
                    name="delegate_pdf_edit",
                    description="Delegate requests for PDF modifications and return the PDF edit result.",
                ),
                ToolOutput(
                    self.delegate_pdf_question,
                    name="delegate_pdf_question",
                    description="Delegate questions about PDF contents and return the PDF question result.",
                ),
                ToolOutput(
                    self.delegate_pdf_summary,
                    name="delegate_pdf_summary",
                    description="Delegate requests to summarise one or more PDFs and return the summary result.",
                ),
                ToolOutput(
                    self.delegate_user_spec,
                    name="delegate_user_spec",
                    description="Delegate requests to create or revise a user agent spec and return the draft result.",
                ),
                ToolOutput(
                    self.math_auditor_agent,
                    name="math_auditor_agent",
                    description=(
                        "Delegate requests to check arithmetic, validate table totals, "
                        "audit financial calculations, or verify mathematical accuracy in PDFs."
                    ),
                ),
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
                "Use delegate_pdf_edit for requested modifications of single or multiple PDFs. "
                "Use delegate_pdf_question for questions about PDF contents. "
                "Use delegate_pdf_summary for requests to summarise PDFs. "
                "Use delegate_user_spec for requests to create or define an agent spec. "
                "Use math_auditor_agent for requests to check arithmetic, validate "
                "table totals, audit financial calculations, or verify math in PDFs. "
                "Use unsupported_capability only when none of the other outputs fit."
            ),
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
        result = await self.agent.run(
            self._build_prompt(request),
            deps=OrchestratorDeps(runtime=self.runtime, request=request),
        )
        logger.info("[orchestrator] routed -> %s", type(result.output).__name__)
        return result.output

    async def _resume(self, request: OrchestratorRequest, capability: SupportedCapability) -> OrchestratorResponse:
        """Fast-path to get back to the correct endpoint without having to call AI."""
        match capability:
            case SupportedCapability.PDF_QUESTION:
                return await self._run_pdf_question(request)
            case SupportedCapability.PDF_EDIT:
                return await self._run_pdf_edit(request)
            case SupportedCapability.PDF_SUMMARY:
                return await self._run_pdf_summary(request)
            case SupportedCapability.AGENT_DRAFT:
                return await self._run_agent_draft(request)
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
        extracted_text = self._get_extracted_text_artifact(request)
        return await PdfEditAgent(self.runtime).handle(
            PdfEditRequest(
                user_message=request.user_message,
                files=request.files,
                conversation_history=request.conversation_history,
                page_text=extracted_text.files if extracted_text is not None else [],
            )
        )

    async def delegate_pdf_question(self, ctx: RunContext[OrchestratorDeps]) -> PdfQuestionResponse:
        return await self._run_pdf_question(ctx.deps.request)

    async def _run_pdf_question(self, request: OrchestratorRequest) -> PdfQuestionResponse:
        extracted_text = self._get_extracted_text_artifact(request)
        return await PdfQuestionAgent(self.runtime).handle(
            PdfQuestionRequest(
                question=request.user_message,
                files=request.files,
                page_text=extracted_text.files if extracted_text is not None else [],
                conversation_history=request.conversation_history,
            )
        )

    async def delegate_pdf_summary(self, ctx: RunContext[OrchestratorDeps]) -> SummaryResponse:
        return await self._run_pdf_summary(ctx.deps.request)

    async def _run_pdf_summary(self, request: OrchestratorRequest) -> SummaryResponse:
        return await SummaryAgent(self.runtime).handle(
            SummaryRequest(
                files=request.files,
                focus=None,
                conversation_history=request.conversation_history,
            )
        )

    async def delegate_user_spec(self, ctx: RunContext[OrchestratorDeps]) -> AgentDraftWorkflowResponse:
        return await self._run_agent_draft(ctx.deps.request)

    async def _run_agent_draft(self, request: OrchestratorRequest) -> AgentDraftWorkflowResponse:
        return await UserSpecAgent(self.runtime).draft(
            AgentDraftRequest(
                user_message=request.user_message,
                conversation_history=request.conversation_history,
            )
        )

    async def math_auditor_agent(self, ctx: RunContext[OrchestratorDeps]) -> EditPlanResponse:
        return EditPlanResponse(
            summary="Validate mathematical calculations in the document.",
            steps=[
                ToolOperationStep(
                    tool=AgentToolId.MATH_AUDITOR_AGENT,
                    parameters=MathAuditorAgentParams(),
                )
            ],
        )

    async def unsupported_capability(
        self,
        ctx: RunContext[OrchestratorDeps],
        capability: str,
        message: str,
    ) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability=capability, message=message)

    def _get_extracted_text_artifact(self, request: OrchestratorRequest) -> ExtractedTextArtifact | None:
        for artifact in request.artifacts:
            if isinstance(artifact, ExtractedTextArtifact):
                return artifact
        return None

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
