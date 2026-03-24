from __future__ import annotations

from typing import Literal

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditOperationPlanStep,
    EditPlanResponse,
    PdfEditRequest,
    PdfEditResponse,
)
from stirling.models.base import ApiModel
from stirling.models.tool_models import OPERATIONS, OperationId, ParamToolModel
from stirling.services.runtime import AppRuntime


class PdfEditPlanSelection(ApiModel):
    outcome: Literal["plan"] = "plan"
    tool: OperationId
    summary: str
    rationale: str | None = None


class PdfEditParameterSelector:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.settings.smart_model_name,
            system_prompt=(
                "Generate only the parameter object for the selected PDF operation. "
                "Use reasonable defaults when the request does not specify optional details. "
                "Only fill fields that belong to the selected operation's parameter model."
            ),
            model_settings=runtime.smart_model_settings(),
        )

    async def select(self, request: PdfEditRequest, operation_id: OperationId) -> ParamToolModel:
        parameter_model = OPERATIONS[operation_id]
        parameter_result = await self.agent.run(
            self._build_parameter_prompt(request, operation_id),
            output_type=NativeOutput(parameter_model),
            instructions=(
                f"Generate only the parameters for the PDF operation `{operation_id.value}`. "
                "Do not include fields from any other operation."
            ),
        )
        return parameter_result.output

    def _build_parameter_prompt(self, request: PdfEditRequest, operation_id: OperationId) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "No file names were provided."
        return (
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Selected operation: {operation_id.value}\n"
            "Return only the parameter object for the selected operation."
        )


class PdfEditAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.supported_operations = list(OPERATIONS)
        self.parameter_selector = PdfEditParameterSelector(runtime)
        self.selection_agent = Agent(
            model=runtime.settings.smart_model_name,
            output_type=NativeOutput(
                [
                    PdfEditPlanSelection,
                    EditClarificationRequest,
                    EditCannotDoResponse,
                ]
            ),
            system_prompt=(
                "Plan PDF edit requests. "
                f"Supported operations are: {self._supported_operations_prompt()}. "
                "Choose exactly one supported operation for a plan. "
                "Do not produce operation parameters in this stage. "
                "Return need_clarification when the request is genuinely ambiguous. "
                "Return cannot_do when the request is outside the supported operations. "
                "Return plan when a reasonable single-operation plan can be created. "
                "Never return partial plans."
            ),
            model_settings=runtime.smart_model_settings(),
        )

    async def handle(self, request: PdfEditRequest) -> PdfEditResponse:
        selection_result = await self.selection_agent.run(self._build_selection_prompt(request))
        selection = selection_result.output
        if isinstance(selection, EditClarificationRequest | EditCannotDoResponse):
            return selection
        parameters = await self.parameter_selector.select(request, selection.tool)
        step = EditOperationPlanStep(
            tool=selection.tool,
            parameters=parameters,
            rationale=selection.rationale,
        )
        return EditPlanResponse(summary=selection.summary, steps=[step])

    def _build_selection_prompt(self, request: PdfEditRequest) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "No file names were provided."
        return (
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Supported operations: {self._supported_operations_prompt()}\n"
            "Plan exactly one supported PDF edit operation or return clarification/cannot_do."
        )

    def _supported_operations_prompt(self) -> str:
        return ", ".join(operation_id.value for operation_id in self.supported_operations)
