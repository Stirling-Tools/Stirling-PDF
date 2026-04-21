from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditPlanResponse,
    PdfEditRequest,
    PdfEditResponse,
    ToolOperationStep,
)
from stirling.models import OPERATIONS, ApiModel, ParamToolModel, ToolEndpoint
from stirling.services import AppRuntime


class PdfEditPlanSelection(ApiModel):
    outcome: Literal["plan"] = "plan"
    operations: list[ToolEndpoint] = Field(min_length=1)
    summary: str
    rationale: str | None = None


class PdfEditParameterSelector:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            system_prompt=(
                "Generate only the parameter object for the selected PDF operation. "
                "Use reasonable defaults when the request does not specify optional details. "
                "Only fill fields that belong to the selected operation's parameter model."
            ),
            model_settings=runtime.smart_model_settings,
        )

    async def select(
        self,
        request: PdfEditRequest,
        operation_plan: list[ToolEndpoint],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> ParamToolModel:
        operation_id = operation_plan[operation_index]
        parameter_model = OPERATIONS[operation_id]
        parameter_result = await self.agent.run(
            self._build_parameter_prompt(request, operation_plan, operation_index, generated_steps),
            output_type=NativeOutput(parameter_model),
            instructions=(
                f"Generate only the parameters for the PDF operation `{operation_id.name}`. "
                "Do not include fields from any other operation."
            ),
        )
        return parameter_result.output

    def _build_parameter_prompt(
        self,
        request: PdfEditRequest,
        operation_plan: list[ToolEndpoint],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> str:
        operation_id = operation_plan[operation_index]
        operation_list = ", ".join(operation.name for operation in operation_plan)
        file_names = ", ".join(request.file_names) if request.file_names else "No file names were provided."
        generated_steps_text = (
            "\n".join(
                f"- Step {step_index + 1}: {step.model_dump_json()}" for step_index, step in enumerate(generated_steps)
            )
            if generated_steps
            else "None"
        )
        return (
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Operation plan: {operation_list}\n"
            f"Selected operation index: {operation_index + 1} of {len(operation_plan)}\n"
            f"Selected operation: {operation_id.name}\n"
            f"Already generated steps:\n{generated_steps_text}\n"
            "Return only the parameter object for the selected operation."
        )


class PdfEditAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.supported_operations = list(OPERATIONS)
        self.parameter_selector = PdfEditParameterSelector(runtime)
        self.selection_agent = Agent(
            model=runtime.smart_model,
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
                "Return an ordered list of one or more supported operations for the plan. "
                "Do not produce operation parameters in this stage. "
                "Return need_clarification when the request is genuinely ambiguous. "
                "Return cannot_do when the request is outside the supported operations. "
                "Return plan when a reasonable multi-step plan can be created. "
                "Never return partial plans."
            ),
            model_settings=runtime.smart_model_settings,
        )

    async def handle(self, request: PdfEditRequest) -> PdfEditResponse:
        selection = await self._select_plan(request)
        if isinstance(selection, EditClarificationRequest | EditCannotDoResponse):
            return selection
        steps: list[ToolOperationStep] = []
        for operation_index, operation_id in enumerate(selection.operations):
            parameters = await self.parameter_selector.select(
                request,
                selection.operations,
                operation_index,
                steps,
            )
            steps.append(
                ToolOperationStep(
                    tool=operation_id,
                    parameters=parameters,
                )
            )
        return EditPlanResponse(
            summary=selection.summary,
            rationale=selection.rationale,
            steps=steps,
        )

    async def _select_plan(
        self,
        request: PdfEditRequest,
    ) -> PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse:
        selection_result = await self.selection_agent.run(self._build_selection_prompt(request))
        return selection_result.output

    def _build_selection_prompt(self, request: PdfEditRequest) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "No file names were provided."
        return (
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Supported operations: {self._supported_operations_prompt()}\n"
            "Plan an ordered list of supported PDF edit operations or return clarification/cannot_do."
        )

    def _supported_operations_prompt(self) -> str:
        return ", ".join(f"{op.name} ({op.value})" for op in self.supported_operations)
