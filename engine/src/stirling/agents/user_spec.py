from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentDraftWorkflowResponse,
    AgentRevisionRequest,
    AgentRevisionResponse,
    AgentRevisionWorkflowResponse,
    AiToolAgentStep,
    ConversationMessage,
    EditPlanResponse,
    OrchestratorRequest,
    PdfEditRequest,
    PdfEditTerminalResponse,
    format_conversation_history,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime


class UserSpecMetadata(ApiModel):
    name: str
    description: str
    objective: str


class UserSpecAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.pdf_edit_agent = PdfEditAgent(runtime)
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(UserSpecMetadata),
            system_prompt=(
                "Create or revise a saved agent draft from the provided request and edit plan. "
                "Return a concise name, description, and objective. "
                "Keep the workflow grounded and practical."
            ),
            model_settings=runtime.smart_model_settings,
        )

    async def orchestrate(self, request: OrchestratorRequest) -> AgentDraftWorkflowResponse:
        """Entry point for the orchestrator delegate — adapts the orchestrator's
        request shape into an :class:`AgentDraftRequest` and runs the standard
        :meth:`draft` pipeline.
        """
        return await self.draft(
            AgentDraftRequest(
                user_message=request.user_message,
                conversation_history=request.conversation_history,
            )
        )

    async def draft(self, request: AgentDraftRequest) -> AgentDraftWorkflowResponse:
        edit_plan = await self._build_edit_plan(request.user_message, request.conversation_history)
        if not isinstance(edit_plan, EditPlanResponse):
            return edit_plan
        return AgentDraftResponse(draft=await self._run_draft_agent(request, edit_plan))

    async def revise(self, request: AgentRevisionRequest) -> AgentRevisionWorkflowResponse:
        edit_plan = await self._build_edit_plan(
            f"Current objective: {request.current_draft.objective}\nRevision request: {request.user_message}",
            request.conversation_history,
        )
        if not isinstance(edit_plan, EditPlanResponse):
            return edit_plan
        return AgentRevisionResponse(draft=await self._run_revision_agent(request, edit_plan))

    async def _run_draft_agent(self, request: AgentDraftRequest, edit_plan: EditPlanResponse) -> AgentDraft:
        metadata = (await self.agent.run(self._build_draft_prompt(request, edit_plan))).output
        return AgentDraft(
            name=metadata.name,
            description=metadata.description,
            objective=metadata.objective,
            steps=[*edit_plan.steps],
        )

    async def _run_revision_agent(self, request: AgentRevisionRequest, edit_plan: EditPlanResponse) -> AgentDraft:
        metadata = (await self.agent.run(self._build_revision_prompt(request, edit_plan))).output
        preserved_ai_steps = [step for step in request.current_draft.steps if isinstance(step, AiToolAgentStep)]
        return AgentDraft(
            name=metadata.name,
            description=metadata.description,
            objective=metadata.objective,
            steps=[*edit_plan.steps, *preserved_ai_steps],
        )

    def _build_draft_prompt(self, request: AgentDraftRequest, edit_plan: EditPlanResponse) -> str:
        return (
            f"User request:\n{request.user_message}\n\n"
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n\n"
            f"Edit plan summary:\n{edit_plan.summary}\n\n"
            f"Edit plan rationale:\n{edit_plan.rationale or 'None'}\n\n"
            f"Edit plan steps:\n{edit_plan.model_dump_json(indent=2)}"
        )

    def _build_revision_prompt(self, request: AgentRevisionRequest, edit_plan: EditPlanResponse) -> str:
        return (
            f"Revision request:\n{request.user_message}\n\n"
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n\n"
            f"Current draft:\n{request.current_draft.model_dump_json(indent=2)}\n\n"
            f"Edit plan summary:\n{edit_plan.summary}\n\n"
            f"Edit plan rationale:\n{edit_plan.rationale or 'None'}\n\n"
            f"Edit plan steps:\n{edit_plan.model_dump_json(indent=2)}"
        )

    async def _build_edit_plan(
        self,
        user_message: str,
        conversation_history: list[ConversationMessage],
    ) -> PdfEditTerminalResponse:
        return await self.pdf_edit_agent.handle(
            PdfEditRequest(user_message=user_message, conversation_history=conversation_history),
            allow_need_content=False,
        )
