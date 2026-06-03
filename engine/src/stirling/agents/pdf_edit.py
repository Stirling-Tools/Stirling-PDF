from __future__ import annotations

import logging
from collections.abc import Iterable
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
    format_file_names,
)
from stirling.logging import Pretty
from stirling.models import OPERATIONS, ApiModel, ParamToolModel, ToolEndpoint
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class PdfEditPlanSelection(ApiModel):
    outcome: Literal["plan"] = "plan"
    rationale: str
    operations: list[ToolEndpoint] = Field(min_length=1)
    summary: str


class PdfEditNeedContentSelection(ApiModel):
    """LLM-facing variant of need_content: the model signals it needs document content and gives
    a reason. File objects are resolved by Python from request.files by matching names, so the
    LLM can't fabricate file ids — it only selects by the display names it sees in the prompt.
    """

    outcome: Literal["need_content"] = "need_content"
    reason: str
    file_names: list[str] | None = Field(
        default=None,
        description=(
            "Names of files whose content is needed. "
            "Use the exact names shown in the prompt. "
            "Omit or leave empty to request content from all files."
        ),
    )
    max_pages: int | None = None
    max_characters: int | None = None


type PdfEditPlanOutput = (
    PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse | PdfEditNeedContentSelection
)


class PdfEditSelectionAgent:
    def __init__(
        self,
        runtime: AppRuntime,
        base_system_prompt: str,
        *,
        allow_need_content: bool,
    ) -> None:
        self.runtime = runtime
        output_types: list[type[PdfEditPlanOutput]] = [
            PdfEditPlanSelection,
            EditClarificationRequest,
            EditCannotDoResponse,
        ]
        system_prompt = base_system_prompt
        if allow_need_content:
            output_types.append(PdfEditNeedContentSelection)
            system_prompt += (
                " Return need_content when planning a correct answer requires inspecting the actual PDF "
                "page text (e.g. 'split after every page that says NEW PAGE', "
                "'rotate pages that mention draft'). "
                "Set file_names to only the files that need to be read; omit it to read all files."
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
            instructions=self._get_operation_instructions(operation_id),
        )
        logger.debug("[pdf-edit params %s] output: %s", operation_id.name, Pretty(parameter_result.output))
        return parameter_result.output

    @staticmethod
    def _get_operation_instructions(operation_id: ToolEndpoint) -> str:
        return (
            f"Generate only the parameters for the PDF operation `{operation_id.name}`. "
            "Do not include fields from any other operation."
        )

    def _build_parameter_prompt(
        self,
        request: PdfEditRequest,
        operation_plan: list[ToolEndpoint],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> str:
        operation_id = operation_plan[operation_index]
        operation_list = ", ".join(operation.name for operation in operation_plan)
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
            f"Files: {format_file_names(request.files)}\n"
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
                files=request.files,
                conversation_history=request.conversation_history,
                page_text=extracted_text.files if extracted_text is not None else [],
                enabled_endpoints=request.enabled_endpoints,
            )
        )

    @overload
    async def handle(self, request: PdfEditRequest, allow_need_content: Literal[False]) -> PdfEditTerminalResponse: ...
    @overload
    async def handle(self, request: PdfEditRequest, allow_need_content: bool = True) -> PdfEditResponse: ...
    async def handle(self, request: PdfEditRequest, allow_need_content: bool = True) -> PdfEditResponse:
        logger.info(
            "[pdf-edit] handle: files=%s has_text=%s allow_need_content=%s enabled=%s msg=%r",
            [file.name for file in request.files],
            has_page_text(request.page_text),
            allow_need_content,
            request.enabled_endpoints,
            request.user_message,
        )
        supported_operations, unavailable_operations = self._classify_operations(request)
        if not supported_operations:
            return EditCannotDoResponse(reason="No PDF edit operations are available on this server.")
        selection = await self._select_plan(
            request, supported_operations, unavailable_operations, allow_need_content=allow_need_content
        )
        if isinstance(selection, EditClarificationRequest | EditCannotDoResponse):
            logger.info("[pdf-edit] selection -> %s: %s", selection.outcome, Pretty(selection))
            return selection
        if isinstance(selection, PdfEditNeedContentSelection):
            logger.info("[pdf-edit] selection -> need_content: %s", selection.reason)
            return self._build_need_content_response(selection, request)
        enabled = set(supported_operations)
        unsupported = [op for op in selection.operations if op not in enabled]
        if unsupported:
            logger.warning("[pdf-edit] plan referenced unavailable operations: %s", [op.name for op in unsupported])
            return EditCannotDoResponse(
                reason=(
                    "The following operations are not available on this server "
                    "(either disabled by the administrator or not installed): "
                    + ", ".join(op.name for op in unsupported)
                )
            )
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
        supported_operations: Iterable[ToolEndpoint],
        unavailable_operations: Iterable[ToolEndpoint],
        *,
        allow_need_content: bool = True,
    ) -> PdfEditPlanOutput:
        can_request_content = allow_need_content and not has_page_text(request.page_text)
        agent = self._build_selection_agent(
            supported_operations,
            unavailable_operations,
            allow_need_content=can_request_content,
        )
        return await agent.select(self._build_selection_prompt(request, supported_operations, unavailable_operations))

    def _build_selection_agent(
        self,
        supported_operations: Iterable[ToolEndpoint],
        unavailable_operations: Iterable[ToolEndpoint],
        *,
        allow_need_content: bool,
    ) -> PdfEditSelectionAgent:
        unavailable_clause = (
            f" The following operations exist on this server but are NOT currently available "
            f"(disabled by the administrator or not installed in this build) and must NOT appear "
            f"in any plan: {self._get_operations_prompt(unavailable_operations)}. "
            "If the user asks for one of these, return cannot_do, name the operation, and explain "
            "that it exists but isn't available on this server."
            if unavailable_operations
            else ""
        )
        return PdfEditSelectionAgent(
            self.runtime,
            base_system_prompt=(
                "Plan PDF edit requests. "
                f"Supported operations are: {self._get_operations_prompt(supported_operations)}."
                f"{unavailable_clause} "
                "Each operation in the user-facing prompt is listed with its full set of parameters. "
                "Treat that list as authoritative: an operation can ONLY do what its listed parameters "
                "and description allow. "
                "Return an ordered list of one or more supported operations for the plan. "
                "Chain multiple operations together whenever the request needs effects that no single "
                "supported operation provides on its own (for example, splitting then rotating then "
                "merging, or extracting pages then re-inserting them). "
                "Only return cannot_do when no sequence of the supported operations could achieve the request. "
                "Do not produce operation parameters in this stage. "
                "Return plan when a reasonable multi-step plan can be created. "
                "Never return partial plans. "
                "Return need_clarification only when the request is genuinely ambiguous in a way "
                "that no reasonable interpretation could produce a correct plan — do not ask to "
                "confirm details that are already clear from the user's message."
            ),
            allow_need_content=allow_need_content,
        )

    def _build_selection_prompt(
        self,
        request: PdfEditRequest,
        supported_operations: Iterable[ToolEndpoint],
        unavailable_operations: Iterable[ToolEndpoint],
    ) -> str:
        unavailable_line = (
            "Unavailable operations (exist but not currently usable): "
            f"{self._get_operations_prompt(unavailable_operations)}\n"
            if unavailable_operations
            else ""
        )
        return (
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n"
            f"User request: {request.user_message}\n"
            f"Files: {format_file_names(request.files)}\n"
            f"Supported operations:\n{self._get_supported_operations_prompt(supported_operations)}\n"
            f"{unavailable_line}"
            f"Extracted page text:\n{format_page_text(request.page_text)}"
        )

    # Endpoints that exist on the server and are callable via the direct API or the manual UI,
    # but are never offered to the AI agent as a routing option.
    #
    # Why: REDACT_EXECUTE is the preferred AI-driven redaction route. AUTO_REDACT and REDACT are
    # legacy endpoints that remain fully functional for human callers (the manual redact UI, direct
    # API consumers, pipelines) but would produce a worse experience if the AI routed to them —
    # they accept a simpler, less expressive schema and pre-date the unified operation model.
    # Hiding them here channels all AI redaction traffic through REDACT_EXECUTE without disabling
    # the legacy endpoints for anyone else.
    #
    # How to reuse: add an endpoint here whenever a legacy endpoint has a preferred replacement
    # that the AI should use exclusively. The endpoint remains live on the server; only the AI
    # planner is prevented from selecting it.
    _AGENT_HIDDEN_ENDPOINTS: frozenset[ToolEndpoint] = frozenset({ToolEndpoint.AUTO_REDACT, ToolEndpoint.REDACT})

    def _classify_operations(self, request: PdfEditRequest) -> tuple[list[ToolEndpoint], list[ToolEndpoint]]:
        """Split the universe of operations into (supported, unavailable) from the agent's
        point of view. Endpoints in `_AGENT_HIDDEN_ENDPOINTS` are filtered out regardless
        of enabled state — they exist on the server but only callers outside the AI
        pipeline (the manual redact UI, direct API consumers) can invoke them.
        """
        enabled_set = set(request.enabled_endpoints)
        supported = [op for op in request.enabled_endpoints if op not in self._AGENT_HIDDEN_ENDPOINTS]
        unavailable = [op for op in OPERATIONS if op not in enabled_set and op not in self._AGENT_HIDDEN_ENDPOINTS]
        return supported, unavailable

    @staticmethod
    def _get_operations_prompt(operations: Iterable[ToolEndpoint]) -> str:
        return ", ".join(f"{op.name} ({op.value})" for op in operations)

    @staticmethod
    def _get_supported_operations_prompt(operations: Iterable[ToolEndpoint]) -> str:
        """Render each operation with its description and a flat list of param descriptions.

        The selection step decides which tool fits the user's request, so it just needs
        what each tool does and what knobs it has, not the full schema.
        """
        lines: list[str] = []
        for op in operations:
            schema = OPERATIONS[op].model_json_schema()
            head = f"- {op.name} ({op.value})"
            description = (schema.get("description") or "").strip()
            if description:
                head += f": {description}"
            lines.append(head)
            for name, prop in (schema.get("properties") or {}).items():
                param_description = (prop.get("description") or "").strip()
                if param_description:
                    lines.append(f"    {name}: {param_description}")
                else:
                    lines.append(f"    {name}")
        return "\n".join(lines)

    def _build_need_content_response(
        self,
        selection: PdfEditNeedContentSelection,
        request: PdfEditRequest,
    ) -> NeedContentResponse:
        # File objects are resolved here by matching names against request.files so the LLM
        # can't fabricate file ids — it selects by display name, Python provides the AiFile.
        if selection.file_names:
            requested = set(selection.file_names)
            files = [f for f in request.files if f.name in requested]
            if not files:
                # Names didn't match anything; fall back to all files rather than sending nothing.
                logger.warning(
                    "[pdf-edit] need_content file_names %s matched no request files — using all",
                    selection.file_names,
                )
                files = request.files
        else:
            files = request.files
        return NeedContentResponse(
            resume_with=SupportedCapability.PDF_EDIT,
            reason=selection.reason,
            files=[NeedContentFileRequest(file=file, content_types=[PdfContentType.PAGE_TEXT]) for file in files],
            max_pages=selection.max_pages or self.runtime.settings.max_pages,
            max_characters=selection.max_characters or self.runtime.settings.max_characters,
        )
