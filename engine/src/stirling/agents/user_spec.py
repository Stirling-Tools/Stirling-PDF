from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.pdf_edit import PdfEditAgent
from stirling.contracts import (
    AgentDraft,
    AgentDraftRequest,
    AgentDraftResponse,
    AgentRevisionRequest,
    AgentRevisionResponse,
    AgentSpecStep,
    AiToolAgentStep,
    EditPlanResponse,
    PdfEditRequest,
    ToolAgentStep,
    ToolOperationStep,
)
from stirling.contracts.common import ConversationMessage
from stirling.models.base import ApiModel
from stirling.services.runtime import AppRuntime


class UserSpecToolStepPresentation(ApiModel):
    title: str
    description: str


class UserSpecDraftPlan(ApiModel):
    name: str
    description: str
    objective: str
    steps: list[UserSpecToolStepPresentation]


class UserSpecAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.pdf_edit_agent = PdfEditAgent(runtime)
        self.agent = Agent(
            model=runtime.settings.smart_model_name,
            output_type=NativeOutput(UserSpecDraftPlan),
            system_prompt=(
                "Create or revise a saved agent draft from the provided request and edit plan. "
                "Return a concise name, description, and objective. "
                "Also return exactly one title/description pair for each provided tool step, in the same order. "
                "Do not change the tool order or invent new steps. "
                "Keep the workflow grounded and practical."
            ),
            model_settings=runtime.smart_model_settings(),
        )

    async def draft(self, request: AgentDraftRequest) -> AgentDraftResponse:
        return AgentDraftResponse(draft=await self._run_draft_agent(request))

    async def revise(self, request: AgentRevisionRequest) -> AgentRevisionResponse:
        return AgentRevisionResponse(draft=await self._run_revision_agent(request))

    async def _run_draft_agent(self, request: AgentDraftRequest) -> AgentDraft:
        edit_plan = await self._build_edit_plan(request.user_message)
        plan_result = await self.agent.run(self._build_draft_prompt(request, edit_plan))
        plan = plan_result.output
        tool_steps = self._build_tool_steps(edit_plan, plan)
        return AgentDraft(
            name=plan.name,
            description=plan.description,
            objective=plan.objective,
            steps=self._combine_steps(tool_steps, []),
        )

    async def _run_revision_agent(self, request: AgentRevisionRequest) -> AgentDraft:
        edit_plan = await self._build_edit_plan(
            f"Current objective: {request.current_draft.objective}\nRevision request: {request.user_message}"
        )
        plan_result = await self.agent.run(self._build_revision_prompt(request, edit_plan))
        plan = plan_result.output
        tool_steps = self._build_tool_steps(edit_plan, plan)
        preserved_ai_steps = [step for step in request.current_draft.steps if isinstance(step, AiToolAgentStep)]
        return AgentDraft(
            name=plan.name,
            description=plan.description,
            objective=plan.objective,
            steps=self._combine_steps(tool_steps, preserved_ai_steps),
        )

    def _build_draft_prompt(self, request: AgentDraftRequest, edit_plan: EditPlanResponse) -> str:
        return (
            f"User request:\n{request.user_message}\n\n"
            f"Conversation history:\n{self._format_conversation_history(request.conversation_history)}\n\n"
            f"Edit plan summary:\n{edit_plan.summary}\n\n"
            f"Edit plan rationale:\n{edit_plan.rationale or 'None'}\n\n"
            f"Edit plan steps:\n{edit_plan.model_dump_json(indent=2)}"
        )

    def _build_revision_prompt(self, request: AgentRevisionRequest, edit_plan: EditPlanResponse) -> str:
        return (
            f"Revision request:\n{request.user_message}\n\n"
            f"Conversation history:\n{self._format_conversation_history(request.conversation_history)}\n\n"
            f"Current draft:\n{request.current_draft.model_dump_json(indent=2)}\n\n"
            f"Edit plan summary:\n{edit_plan.summary}\n\n"
            f"Edit plan rationale:\n{edit_plan.rationale or 'None'}\n\n"
            f"Edit plan steps:\n{edit_plan.model_dump_json(indent=2)}"
        )

    def _format_conversation_history(self, conversation_history: list[ConversationMessage]) -> str:
        if not conversation_history:
            return "None"
        return "\n".join(f"- {message.role}: {message.content}" for message in conversation_history)

    async def _build_edit_plan(self, user_message: str) -> EditPlanResponse:
        edit_result = await self.pdf_edit_agent.handle(PdfEditRequest(user_message=user_message))
        if not isinstance(edit_result, EditPlanResponse):
            return EditPlanResponse(summary="No actionable tool steps.", steps=[])
        return edit_result

    def _build_tool_steps(
        self,
        edit_plan: EditPlanResponse,
        plan: UserSpecDraftPlan,
    ) -> list[ToolAgentStep]:
        return [
            ToolAgentStep(
                title=plan.steps[step_index].title if step_index < len(plan.steps) else "Tool step",
                description=(
                    plan.steps[step_index].description
                    if step_index < len(plan.steps)
                    else "Execute the planned tool step."
                ),
                tool_step=ToolOperationStep(
                    tool=step.tool,
                    parameters=step.parameters,
                ),
            )
            for step_index, step in enumerate(edit_plan.steps)
        ]

    def _combine_steps(
        self,
        tool_steps: list[ToolAgentStep],
        ai_steps: list[AiToolAgentStep],
    ) -> list[AgentSpecStep]:
        combined_steps: list[AgentSpecStep] = []
        combined_steps.extend(tool_steps)
        combined_steps.extend(ai_steps)
        return combined_steps
