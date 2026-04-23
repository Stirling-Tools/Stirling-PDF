from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import assert_never

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.smart_redaction import SmartRedactionWorkflow
from stirling.agents.user_spec import UserSpecAgent
from stirling.contracts import (
    AgentDraftRequest,
    AgentDraftWorkflowResponse,
    EditCannotDoResponse,
    ExtractedTextArtifact,
    NeedContentResponse,
    OrchestratorRequest,
    OrchestratorResponse,
    PdfEditRequest,
    PdfEditResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    SupportedCapability,
    ToolOperationStep,
    UnsupportedCapabilityResponse,
    format_conversation_history,
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
                    self.smart_redaction_agent,
                    name="smart_redaction_agent",
                    description=(
                        "Delegate requests to redact, remove, or hide content from PDFs. "
                        "Use for redacting PII, names, phone numbers, bank details, "
                        "specific text, document sections, or any sensitive content."
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
                "Use delegate_user_spec for requests to create or define an agent spec. "
                "Use math_auditor_agent for requests to check arithmetic, validate "
                "table totals, audit financial calculations, or verify math in PDFs. "
                "Use smart_redaction_agent for requests to redact, remove, or hide "
                "content from PDFs (PII, names, phone numbers, sections, etc.). "
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
        """Fast-path to get back to the correct endpoint without having to call AI."""
        match capability:
            case SupportedCapability.PDF_QUESTION:
                return await self._run_pdf_question(request)
            case SupportedCapability.PDF_EDIT:
                return await self._run_pdf_edit(request)
            case SupportedCapability.AGENT_DRAFT:
                return await self._run_agent_draft(request)
            case SupportedCapability.SMART_REDACTION_AGENT:
                return await self._run_smart_redaction(request)
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
                file_names=request.file_names,
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
                file_names=request.file_names,
                page_text=extracted_text.files if extracted_text is not None else [],
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

    async def smart_redaction_agent(
        self, ctx: RunContext[OrchestratorDeps]
    ) -> EditPlanResponse | NeedContentResponse | EditCannotDoResponse:
        return await self._run_smart_redaction(ctx.deps.request)

    async def _run_smart_redaction(
        self, request: OrchestratorRequest
    ) -> EditPlanResponse | NeedContentResponse | EditCannotDoResponse:
        workflow = SmartRedactionWorkflow(self.runtime)
        extracted_text = self._get_extracted_text_artifact(request)

        if extracted_text is None:
            # First call — run the planner to classify the strategy.
            planner_output = await workflow.plan(request.user_message)

            if planner_output.strategy in ("literal", "regex", "image_redact"):
                # No document scan needed — build the plan immediately.
                plan = workflow.build_immediate_plan(planner_output, request.user_message)
                if plan is not None:
                    return plan
                return EditCannotDoResponse(reason="Could not resolve redaction patterns for the request.")

            # LLM_SCAN or MIXED — need document text.
            return SmartRedactionWorkflow.need_content_response(request.file_names)

        # Second call — have text artifacts, run the analyser.
        pages_text = "\n".join(
            f"--- {('Page ' + str(page.page_number)) if page.page_number is not None else 'Page'}"
            f" ({file_text.file_name}) ---\n{page.text}"
            for file_text in extracted_text.files
            for page in file_text.pages
        )

        return workflow.build_plan_from_analysis(
            await workflow.analyse(request.user_message, pages_text),
            request.user_message,
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
