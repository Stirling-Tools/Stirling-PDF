from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import assert_never

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents.math_presentation import (
    extract_math_verdict,
    is_math_intent,
    verdict_to_add_comments_payload,
    verdict_to_prose,
)
from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
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
    SupportedCapability,
    ToolOperationStep,
    UnsupportedCapabilityResponse,
    format_conversation_history,
)
from stirling.contracts.pdf_edit import EditPlanResponse
from stirling.contracts.pdf_questions import PdfQuestionAnswerResponse
from stirling.models.tool_models import (
    AddCommentsParams,
    MathAuditorAgentParams,
    PdfCommentAgentParams,
    ToolEndpoint,
)
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
                "Use delegate_pdf_review when the user wants the PDF returned with review"
                " comments attached — anything like 'review this', 'annotate with comments',"
                " 'leave feedback on the PDF'. If the user is asking a question about the PDF"
                " contents (and does NOT want comments written onto the document) use"
                " delegate_pdf_question instead. "
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

    async def delegate_pdf_question(self, ctx: RunContext[OrchestratorDeps]) -> PdfQuestionResponse | EditPlanResponse:
        return await self._run_pdf_question(ctx.deps.request)

    async def _run_pdf_question(self, request: OrchestratorRequest) -> PdfQuestionResponse | EditPlanResponse:
        """Answer a question about a PDF.

        When the prompt smells like math, consults the math-auditor specialist first (via a
        plan step + resume), then digests the :class:`Verdict` into a prose answer. All other
        prompts go through the general :class:`PdfQuestionAgent`.
        """
        if is_math_intent(request.user_message):
            verdict = extract_math_verdict(request)
            if verdict is None:
                # First turn — ask Java to run the math specialist and come back.
                return EditPlanResponse(
                    summary="Consulting the math auditor to answer the question...",
                    steps=[
                        ToolOperationStep(
                            tool=ToolEndpoint.MATH_AUDITOR_AGENT,
                            parameters=MathAuditorAgentParams(),
                        )
                    ],
                    resume_with=SupportedCapability.PDF_QUESTION,
                )
            # Second turn — Verdict in hand, render as a prose answer.
            return PdfQuestionAnswerResponse(
                answer=verdict_to_prose(verdict),
                evidence=[],
            )

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

    async def delegate_pdf_review(self, ctx: RunContext[OrchestratorDeps]) -> EditPlanResponse:
        return await self._run_pdf_review(ctx.deps.request)

    async def _run_pdf_review(self, request: OrchestratorRequest) -> EditPlanResponse:
        """Produce an annotated PDF with review comments.

        Math-flavoured prompts: consult math-auditor first, then project the :class:`Verdict`
        into sticky-note specs for ``/api/v1/misc/add-comments``. Other review prompts go
        through the composed :class:`PdfCommentAgentOrchestrator` (``/api/v1/ai/tools/pdf-comment-agent``)
        which does its own chunk extraction + AI round-trip.
        """
        if is_math_intent(request.user_message):
            verdict = extract_math_verdict(request)
            if verdict is None:
                return EditPlanResponse(
                    summary="Consulting the math auditor to flag errors on the PDF...",
                    steps=[
                        ToolOperationStep(
                            tool=ToolEndpoint.MATH_AUDITOR_AGENT,
                            parameters=MathAuditorAgentParams(),
                        )
                    ],
                    resume_with=SupportedCapability.PDF_REVIEW,
                )
            # Verdict in hand — project to comment specs and emit the annotate step.
            comments_json = verdict_to_add_comments_payload(verdict)
            discrepancy_count = len(verdict.discrepancies or [])
            return EditPlanResponse(
                summary=(f"Flagging {discrepancy_count} math issue{'s' if discrepancy_count != 1 else ''} on the PDF."),
                steps=[
                    ToolOperationStep(
                        tool=ToolEndpoint.ADD_COMMENTS,
                        parameters=AddCommentsParams(comments=comments_json),
                    )
                ],
            )

        return EditPlanResponse(
            summary="Add AI-generated review comments to the PDF.",
            steps=[
                ToolOperationStep(
                    tool=ToolEndpoint.PDF_COMMENT_AGENT,
                    parameters=PdfCommentAgentParams(prompt=request.user_message),
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
