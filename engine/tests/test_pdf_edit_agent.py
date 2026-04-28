from __future__ import annotations

from dataclasses import dataclass

import pytest

from stirling.agents import PdfEditAgent, PdfEditParameterSelector, PdfEditPlanSelection
from stirling.agents.pdf_edit import PdfEditPlanOutput
from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditPlanResponse,
    ExtractedFileText,
    NeedContentFileRequest,
    NeedContentResponse,
    PdfContentType,
    PdfEditRequest,
    PdfTextSelection,
    SupportedCapability,
    ToolOperationStep,
)
from stirling.models import OPERATIONS
from stirling.models.tool_models import Angle, FlattenParams, RotatePdfParams, ToolEndpoint
from stirling.services.runtime import AppRuntime


@dataclass(frozen=True)
class ParameterSelectorCall:
    request: PdfEditRequest
    operation_plan: list[ToolEndpoint]
    operation_index: int
    generated_steps: list[ToolOperationStep]


class RecordingParameterSelector:
    def __init__(self) -> None:
        self.calls: list[ParameterSelectorCall] = []

    async def select(
        self,
        request: PdfEditRequest,
        operation_plan: list[ToolEndpoint],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> RotatePdfParams | FlattenParams:
        self.calls.append(
            ParameterSelectorCall(
                request=request,
                operation_plan=operation_plan,
                operation_index=operation_index,
                generated_steps=list(generated_steps),
            )
        )
        if operation_index == 0:
            return RotatePdfParams(angle=Angle(90))
        return FlattenParams(flatten_only_forms=False, render_dpi=None)


class StubPdfEditAgent(PdfEditAgent):
    def __init__(
        self,
        runtime: AppRuntime,
        selection: PdfEditPlanOutput,
        parameter_selector: RecordingParameterSelector | PdfEditParameterSelector | None = None,
    ) -> None:
        super().__init__(runtime)
        self.selection = selection
        if parameter_selector is not None:
            self.parameter_selector = parameter_selector

    async def _select_plan(
        self,
        request: PdfEditRequest,
        supported_operations: list[ToolEndpoint],
        *,
        allow_need_content: bool = True,
    ) -> PdfEditPlanOutput:
        return self.selection


@pytest.mark.anyio
async def test_pdf_edit_agent_builds_multi_step_plan(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.ROTATE_PDF, ToolEndpoint.FLATTEN],
            summary="Rotate the PDF, then compress it.",
            rationale="The pages need reorientation before reducing file size.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Rotate the PDF clockwise and then compress it.",
            file_names=["scan.pdf"],
        )
    )

    assert isinstance(response, EditPlanResponse)
    assert response.summary == "Rotate the PDF, then compress it."
    assert response.rationale == "The pages need reorientation before reducing file size."
    assert [step.tool for step in response.steps] == [ToolEndpoint.ROTATE_PDF, ToolEndpoint.FLATTEN]
    assert isinstance(response.steps[0].parameters, RotatePdfParams)
    assert isinstance(response.steps[1].parameters, FlattenParams)


@pytest.mark.anyio
async def test_pdf_edit_agent_passes_previous_steps_to_parameter_selector(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.ROTATE_PDF, ToolEndpoint.FLATTEN],
            summary="Rotate the PDF, then compress it.",
        ),
        parameter_selector=parameter_selector,
    )

    request = PdfEditRequest(
        user_message="Rotate the PDF clockwise and then compress it.",
        file_names=["scan.pdf"],
    )
    response = await agent.handle(request)

    assert isinstance(response, EditPlanResponse)
    assert len(parameter_selector.calls) == 2
    assert parameter_selector.calls[0].operation_index == 0
    assert parameter_selector.calls[0].generated_steps == []
    assert parameter_selector.calls[1].operation_index == 1
    assert parameter_selector.calls[1].generated_steps == [
        ToolOperationStep(
            tool=ToolEndpoint.ROTATE_PDF,
            parameters=RotatePdfParams(angle=Angle(90)),
        )
    ]


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_clarification_without_partial_plan(runtime: AppRuntime) -> None:
    agent = StubPdfEditAgent(
        runtime,
        EditClarificationRequest(
            question="Which pages should be rotated?",
            reason="The request does not say which pages to change.",
        ),
    )

    response = await agent.handle(PdfEditRequest(user_message="Rotate some pages."))

    assert isinstance(response, EditClarificationRequest)


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_cannot_do_without_partial_plan(runtime: AppRuntime) -> None:
    agent = StubPdfEditAgent(
        runtime,
        EditCannotDoResponse(
            reason="This request requires OCR, which is not part of PDF edit planning.",
        ),
    )

    response = await agent.handle(PdfEditRequest(user_message="Read this scan and summarize it."))

    assert isinstance(response, EditCannotDoResponse)


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_need_content_without_building_plan(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        NeedContentResponse(
            resume_with=SupportedCapability.PDF_EDIT,
            reason="Need page text to locate the NEW PAGE markers.",
            files=[],
            max_pages=0,
            max_characters=0,
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Split after every page that says 'NEW PAGE'.",
            file_names=["report.pdf"],
        )
    )

    assert isinstance(response, NeedContentResponse)
    assert response.resume_with == SupportedCapability.PDF_EDIT
    assert response.files == [NeedContentFileRequest(file_name="report.pdf", content_types=[PdfContentType.PAGE_TEXT])]
    assert response.max_pages == runtime.settings.max_pages
    assert response.max_characters == runtime.settings.max_characters
    assert parameter_selector.calls == []


@pytest.mark.anyio
async def test_pdf_edit_agent_builds_selection_agent_matching_content_availability(runtime: AppRuntime) -> None:
    from stirling.agents.pdf_edit import PdfEditSelectionAgent

    agent = PdfEditAgent(runtime)
    captured: list[bool] = []

    def record(supported_operations: list[ToolEndpoint], *, allow_need_content: bool) -> PdfEditSelectionAgent:
        captured.append(allow_need_content)
        raise _StopSelectionError()

    agent._build_selection_agent = record

    supported = list(OPERATIONS)
    with pytest.raises(_StopSelectionError):
        await agent._select_plan(PdfEditRequest(user_message="Rotate."), supported)
    with pytest.raises(_StopSelectionError):
        await agent._select_plan(
            PdfEditRequest(
                user_message="Rotate.",
                page_text=[
                    ExtractedFileText(
                        file_name="report.pdf",
                        pages=[PdfTextSelection(page_number=1, text="content")],
                    )
                ],
            ),
            supported,
        )
    with pytest.raises(_StopSelectionError):
        await agent._select_plan(PdfEditRequest(user_message="Rotate."), supported, allow_need_content=False)

    assert captured == [True, False, False]


@pytest.mark.anyio
async def test_pdf_edit_selection_agent_excludes_need_content_from_schema_when_not_allowed(
    runtime: AppRuntime,
) -> None:
    from stirling.agents.pdf_edit import PdfEditSelectionAgent

    can_request = PdfEditSelectionAgent(runtime, "base", allow_need_content=True)
    cannot_request = PdfEditSelectionAgent(runtime, "base", allow_need_content=False)

    assert NeedContentResponse in _agent_output_types(can_request)
    assert NeedContentResponse not in _agent_output_types(cannot_request)


def _agent_output_types(agent: object) -> list[type]:
    native = getattr(getattr(agent, "agent"), "output_type")
    return list(getattr(native, "outputs", []))


class _StopSelectionError(Exception):
    pass


@pytest.mark.anyio
async def test_pdf_edit_agent_passes_page_text_to_parameter_selector(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.ROTATE_PDF],
            summary="Rotate the PDF.",
        ),
        parameter_selector=parameter_selector,
    )

    page_text = [
        ExtractedFileText(
            file_name="report.pdf",
            pages=[PdfTextSelection(page_number=1, text="NEW PAGE")],
        )
    ]
    await agent.handle(
        PdfEditRequest(
            user_message="Rotate clockwise.",
            file_names=["report.pdf"],
            page_text=page_text,
        )
    )

    assert parameter_selector.calls[0].request.page_text == page_text


def test_filter_operations_by_disabled_returns_full_set_when_no_disabled() -> None:
    from stirling.agents.pdf_edit import filter_operations_by_disabled

    assert filter_operations_by_disabled(list(OPERATIONS), []) == list(OPERATIONS)


def test_filter_operations_by_disabled_drops_matching_endpoints() -> None:
    from stirling.agents.pdf_edit import filter_operations_by_disabled

    filtered = filter_operations_by_disabled(
        list(OPERATIONS),
        [ToolEndpoint.COMPRESS_PDF, ToolEndpoint.ROTATE_PDF],
    )

    assert ToolEndpoint.COMPRESS_PDF not in filtered
    assert ToolEndpoint.ROTATE_PDF not in filtered
    assert ToolEndpoint.FLATTEN in filtered


@pytest.mark.anyio
async def test_pdf_edit_agent_filters_supported_operations_using_disabled_endpoints(
    runtime: AppRuntime,
) -> None:
    agent = PdfEditAgent(runtime)
    request = PdfEditRequest(
        user_message="Compress this PDF.",
        disabled_endpoints=[ToolEndpoint.COMPRESS_PDF],
    )

    supported = agent._supported_operations(request)

    assert ToolEndpoint.COMPRESS_PDF not in supported
    assert ToolEndpoint.FLATTEN in supported


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_cannot_do_when_all_operations_disabled(
    runtime: AppRuntime,
) -> None:
    agent = PdfEditAgent(runtime)
    response = await agent.handle(
        PdfEditRequest(
            user_message="Do anything.",
            disabled_endpoints=list(OPERATIONS),
        )
    )

    assert isinstance(response, EditCannotDoResponse)


@pytest.mark.anyio
async def test_pdf_edit_agent_rejects_plan_referencing_disabled_operations(
    runtime: AppRuntime,
) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.COMPRESS_PDF],
            summary="Compress.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Compress this PDF.",
            disabled_endpoints=[ToolEndpoint.COMPRESS_PDF],
        )
    )

    assert isinstance(response, EditCannotDoResponse)
    assert parameter_selector.calls == []
