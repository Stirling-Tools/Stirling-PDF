from __future__ import annotations

import logging
from typing import Literal, overload

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents._page_text import format_page_text, get_extracted_text_artifact, has_page_text
from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditPlanResponse,
    NeedContentFileRequest,
    NeedContentResponse,
    OrchestratorRequest,
    PdfContentType,
    PdfEditRequest,
    PdfEditResponse,
    PdfEditTerminalResponse,
    SupportedCapability,
    ToolOperationStep,
    format_conversation_history,
)
from stirling.logging import Pretty
from stirling.models import OPERATIONS, ApiModel, ParamToolModel, ToolEndpoint
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class PdfEditPlanSelection(ApiModel):
    outcome: Literal["plan"] = "plan"
    operations: list[ToolEndpoint] = Field(min_length=1)
    summary: str
    rationale: str | None = None


type PdfEditPlanOutput = PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse | NeedContentResponse


class PdfEditSelectionAgent:
    def __init__(self, runtime: AppRuntime, base_system_prompt: str, *, allow_need_content: bool) -> None:
        self.runtime = runtime
        output_types: list[type[PdfEditPlanOutput]] = [
            PdfEditPlanSelection,
            EditClarificationRequest,
            EditCannotDoResponse,
        ]
        system_prompt = base_system_prompt
        if allow_need_content:
            output_types.append(NeedContentResponse)
            system_prompt += (
                " Return need_content when planning a correct answer requires inspecting the actual PDF "
                "page text (e.g. 'split after every page that says NEW PAGE', "
                "'rotate pages that mention draft')."
            )
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(output_types),
            system_prompt=system_prompt,
            model_settings=runtime.smart_model_settings,
        )

    async def select(self, prompt: str) -> PdfEditPlanOutput:
        logger.debug("[pdf-edit selection] prompt:\n%s", prompt)
        result = await self.agent.run(prompt)
        logger.debug("[pdf-edit selection] output: %s", Pretty(result.output))
        return result.output


class PdfEditParameterSelector:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            system_prompt=(
                "Generate only the parameter object for the selected PDF operation. "
                "Use reasonable defaults when the request does not specify optional details. "
                "Only fill fields that belong to the selected operation's parameter model. "
                "When extracted page text is provided, use it to compute precise parameters "
                "(e.g. exact page ranges that match a described pattern)."
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
        prompt = self._build_parameter_prompt(request, operation_plan, operation_index, generated_steps)
        logger.debug("[pdf-edit params %s] prompt:\n%s", operation_id.name, prompt)
        parameter_result = await self.agent.run(
            prompt,
            output_type=NativeOutput(parameter_model),
            instructions=(
                f"Generate only the parameters for the PDF operation `{operation_id.name}`. "
                "Do not include fields from any other operation."
            ),
        )
        logger.debug("[pdf-edit params %s] output: %s", operation_id.name, Pretty(parameter_result.output))
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
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n"
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Operation plan: {operation_list}\n"
            f"Selected operation index: {operation_index + 1} of {len(operation_plan)}\n"
            f"Selected operation: {operation_id.name}\n"
            f"Already generated steps:\n{generated_steps_text}\n"
            f"Extracted page text:\n{format_page_text(request.page_text)}\n"
            "Return only the parameter object for the selected operation."
        )


class PdfEditAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.supported_operations = list(OPERATIONS)
        self.parameter_selector = PdfEditParameterSelector(runtime)

    async def orchestrate(self, request: OrchestratorRequest) -> PdfEditResponse:
        """Entry point for the orchestrator delegate — adapts the orchestrator's
        request shape into a :class:`PdfEditRequest` and runs the standard
        :meth:`handle` pipeline. Direct API callers continue to use ``handle``
        with a typed :class:`PdfEditRequest`.
        """
        extracted_text = get_extracted_text_artifact(request)
        return await self.handle(
            PdfEditRequest(
                user_message=request.user_message,
                file_names=request.file_names,
                conversation_history=request.conversation_history,
                page_text=extracted_text.files if extracted_text is not None else [],
            )
        )

    @overload
    async def handle(self, request: PdfEditRequest, allow_need_content: Literal[False]) -> PdfEditTerminalResponse: ...
    @overload
    async def handle(self, request: PdfEditRequest, allow_need_content: bool = True) -> PdfEditResponse: ...
    async def handle(self, request: PdfEditRequest, allow_need_content: bool = True) -> PdfEditResponse:
        logger.info(
            "[pdf-edit] handle: files=%s has_text=%s allow_need_content=%s msg=%r",
            request.file_names,
            has_page_text(request.page_text),
            allow_need_content,
            request.user_message,
        )
        selection = await self._select_plan(request, allow_need_content=allow_need_content)
        if isinstance(selection, EditClarificationRequest | EditCannotDoResponse):
            logger.info("[pdf-edit] selection -> %s: %s", selection.outcome, Pretty(selection))
            return selection
        if isinstance(selection, NeedContentResponse):
            logger.info("[pdf-edit] selection -> need_content: %s", selection.reason)
            return self._fill_need_content_defaults(selection, request)
        logger.info("[pdf-edit] plan: %s", [op.name for op in selection.operations])
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
        allow_need_content: bool = True,
    ) -> PdfEditPlanOutput:
        can_request_content = allow_need_content and not has_page_text(request.page_text)
        agent = self._build_selection_agent(allow_need_content=can_request_content)
        return await agent.select(self._build_selection_prompt(request))

    def _build_selection_agent(self, *, allow_need_content: bool) -> PdfEditSelectionAgent:
        return PdfEditSelectionAgent(
            self.runtime,
            base_system_prompt=(
                "Plan PDF edit requests. "
                f"Supported operations are: {self._supported_operations_prompt()}. "
                "Return an ordered list of one or more supported operations for the plan. "
                "Do not produce operation parameters in this stage. "
                "Return need_clarification when the request is genuinely ambiguous. "
                "Return cannot_do when the request is outside the supported operations. "
                "Return plan when a reasonable multi-step plan can be created. "
                "Never return partial plans."
            ),
            allow_need_content=allow_need_content,
        )

    def _build_selection_prompt(self, request: PdfEditRequest) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "No file names were provided."
        return (
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n"
            f"User request: {request.user_message}\n"
            f"Files: {file_names}\n"
            f"Supported operations: {self._supported_operations_prompt()}\n"
            f"Extracted page text:\n{format_page_text(request.page_text)}"
        )

    def _supported_operations_prompt(self) -> str:
        return ", ".join(f"{op.name} ({op.value})" for op in self.supported_operations)

    def _fill_need_content_defaults(
        self,
        selection: NeedContentResponse,
        request: PdfEditRequest,
    ) -> NeedContentResponse:
        files = selection.files or [
            NeedContentFileRequest(file_name=file_name, content_types=[PdfContentType.PAGE_TEXT])
            for file_name in request.file_names
        ]
        return NeedContentResponse(
            resume_with=SupportedCapability.PDF_EDIT,
            reason=selection.reason,
            files=files,
            max_pages=selection.max_pages or self.runtime.settings.max_pages,
            max_characters=selection.max_characters or self.runtime.settings.max_characters,
        )
