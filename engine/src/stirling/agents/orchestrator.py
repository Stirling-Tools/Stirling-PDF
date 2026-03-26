from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

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
    UnsupportedCapabilityResponse,
)
from stirling.services import AppRuntime


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
                    self.unsupported_capability,
                    name="unsupported_capability",
                    description="Return this when none of the delegate outputs fit the request.",
                ),
            ],
            deps_type=OrchestratorDeps,
            system_prompt=(
                "You are the top-level orchestrator. "
                "Choose exactly one output function that best handles the request. "
                "Use delegate_pdf_edit for requested PDF modifications. "
                "Use delegate_pdf_question for questions about PDF contents. "
                "Use delegate_user_spec for requests to create or define an agent spec. "
                "Use unsupported_capability only when none of the other outputs fit."
            ),
            model_settings=runtime.fast_model_settings,
        )

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        result = await self.agent.run(
            self._build_prompt(request),
            deps=OrchestratorDeps(runtime=self.runtime, request=request),
        )
        return result.output

    async def delegate_pdf_edit(self, ctx: RunContext[OrchestratorDeps]) -> PdfEditResponse:
        request = ctx.deps.request
        return await PdfEditAgent(ctx.deps.runtime).handle(
            PdfEditRequest(user_message=request.user_message, conversation_id=request.conversation_id)
        )

    async def delegate_pdf_question(self, ctx: RunContext[OrchestratorDeps]) -> PdfQuestionResponse:
        request = ctx.deps.request
        extracted_text = self._get_extracted_text_artifact(request)
        return await PdfQuestionAgent(ctx.deps.runtime).handle(
            PdfQuestionRequest(
                question=request.user_message,
                conversation_id=request.conversation_id,
                file_name=request.file_name,
                page_text=extracted_text.pages if extracted_text is not None else [],
            )
        )

    async def delegate_user_spec(self, ctx: RunContext[OrchestratorDeps]) -> AgentDraftWorkflowResponse:
        request = ctx.deps.request
        return await UserSpecAgent(ctx.deps.runtime).draft(AgentDraftRequest(user_message=request.user_message))

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
        file_name = request.file_name or "Unknown file"
        return (
            f"User message: {request.user_message}\n"
            f"File: {file_name}\n"
            f"Conversation ID: {request.conversation_id or 'none'}\n"
            f"Available artifacts:\n{artifact_summary}"
        )

    def _describe_artifacts(self, request: OrchestratorRequest) -> str:
        if not request.artifacts:
            return "- none"

        descriptions: list[str] = []
        for artifact in request.artifacts:
            if isinstance(artifact, ExtractedTextArtifact):
                page_numbers = [page.page_number for page in artifact.pages if page.page_number is not None]
                descriptions.append(
                    f"- extracted_text: {len(artifact.pages)} pages"
                    + (f" (pages {page_numbers})" if page_numbers else "")
                )
                continue
            descriptions.append("- unknown artifact")
        return "\n".join(descriptions)
