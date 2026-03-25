from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai import Agent
from pydantic_ai.output import ToolOutput
from pydantic_ai.tools import RunContext

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.user_spec import UserSpecAgent
from stirling.contracts import OrchestratorRequest, OrchestratorResponse, UnsupportedCapabilityResponse
from stirling.contracts.agent_drafts import AgentDraftRequest, AgentDraftResponse
from stirling.contracts.pdf_edit import (
    PdfEditRequest,
    PdfEditResponse,
)
from stirling.contracts.pdf_questions import (
    PdfQuestionRequest,
    PdfQuestionResponse,
)
from stirling.services.runtime import AppRuntime


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
                "Use delegate_pdf_question for questions about the contents of a PDF. "
                "Use delegate_user_spec for requests to create or define an agent spec. "
                "Use unsupported_capability only when none of the other outputs fit."
            ),
            model_settings=runtime.fast_model_settings(),
        )

    async def handle(self, request: OrchestratorRequest) -> OrchestratorResponse:
        result = await self.agent.run(
            request.user_message,
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
        return await PdfQuestionAgent(ctx.deps.runtime).handle(
            PdfQuestionRequest(question=request.user_message, conversation_id=request.conversation_id)
        )

    async def delegate_user_spec(self, ctx: RunContext[OrchestratorDeps]) -> AgentDraftResponse:
        request = ctx.deps.request
        return await UserSpecAgent(ctx.deps.runtime).draft(AgentDraftRequest(user_message=request.user_message))

    async def unsupported_capability(
        self,
        ctx: RunContext[OrchestratorDeps],
        capability: str,
        message: str,
    ) -> UnsupportedCapabilityResponse:
        return UnsupportedCapabilityResponse(capability=capability, message=message)
