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
from stirling.models import ParamToolModel
from stirling.models.tool_models import (
    Angle,
    EditTextOperation,
    EditTextParams,
    FlattenParams,
    RotatePdfParams,
    ToolEndpoint,
)
from stirling.services.runtime import AppRuntime


@dataclass(frozen=True)
class ParameterSelectorCall:
    request: PdfEditRequest
    operation_plan: list[ToolEndpoint]
    operation_index: int
    generated_steps: list[ToolOperationStep]


class RecordingParameterSelector:
    """Test double that records calls and returns predetermined parameter objects per index."""

    def __init__(self, params_by_index: list[ParamToolModel] | None = None) -> None:
        self.calls: list[ParameterSelectorCall] = []
        self._params_by_index = params_by_index

    async def select(
        self,
        request: PdfEditRequest,
        operation_plan: list[ToolEndpoint],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> ParamToolModel:
        self.calls.append(
            ParameterSelectorCall(
                request=request,
                operation_plan=operation_plan,
                operation_index=operation_index,
                generated_steps=list(generated_steps),
            )
        )
        if self._params_by_index is not None:
            return self._params_by_index[operation_index]
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

    def record(*, allow_need_content: bool) -> PdfEditSelectionAgent:
        captured.append(allow_need_content)
        raise _StopSelectionError()

    agent._build_selection_agent = record

    with pytest.raises(_StopSelectionError):
        await agent._select_plan(PdfEditRequest(user_message="Rotate."))
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
            )
        )
    with pytest.raises(_StopSelectionError):
        await agent._select_plan(PdfEditRequest(user_message="Rotate."), allow_need_content=False)

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


@pytest.mark.anyio
async def test_pdf_edit_agent_supports_literal_find_replace(runtime: AppRuntime) -> None:
    params = EditTextParams(
        edits=[EditTextOperation(find="2025", replace="2026")],
        page_numbers="all",
        use_regex=False,
        whole_word_search=False,
    )
    parameter_selector = RecordingParameterSelector([params])
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.EDIT_TEXT],
            summary="Replace 2025 with 2026 throughout the document.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Change every 2025 to 2026.",
            file_names=["contract.pdf"],
        )
    )

    assert isinstance(response, EditPlanResponse)
    assert len(response.steps) == 1
    step = response.steps[0]
    assert step.tool == ToolEndpoint.EDIT_TEXT
    assert isinstance(step.parameters, EditTextParams)
    assert step.parameters.edits == [EditTextOperation(find="2025", replace="2026")]


@pytest.mark.anyio
async def test_pdf_edit_agent_supports_copy_edit_using_page_text(runtime: AppRuntime) -> None:
    page_text = [
        ExtractedFileText(
            file_name="memo.pdf",
            pages=[PdfTextSelection(page_number=3, text="A typo: teh quick brown fox jumpd over.")],
        )
    ]
    params = EditTextParams(
        edits=[
            EditTextOperation(find="teh", replace="the"),
            EditTextOperation(find="jumpd", replace="jumped"),
        ],
        page_numbers="3",
        use_regex=False,
        whole_word_search=False,
    )
    parameter_selector = RecordingParameterSelector([params])
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.EDIT_TEXT],
            summary="Fix typos on page 3.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Fix typos on page 3.",
            file_names=["memo.pdf"],
            page_text=page_text,
        )
    )

    assert isinstance(response, EditPlanResponse)
    assert len(parameter_selector.calls) == 1
    # The parameter selector receives the extracted page text, which is what enables free-form
    # copy-editing: it can read the current text and propose specific edits.
    assert parameter_selector.calls[0].request.page_text == page_text
    step = response.steps[0]
    assert step.tool == ToolEndpoint.EDIT_TEXT
    assert isinstance(step.parameters, EditTextParams)
    assert step.parameters.page_numbers == "3"
    assert step.parameters.edits is not None
    assert len(step.parameters.edits) == 2


@pytest.mark.anyio
async def test_pdf_edit_agent_supports_natural_language_directed_edit(runtime: AppRuntime) -> None:
    page_text = [
        ExtractedFileText(
            file_name="agreement.pdf",
            pages=[
                PdfTextSelection(
                    page_number=1,
                    text="This agreement is between OldCompany Inc. and the client.",
                )
            ],
        )
    ]
    params = EditTextParams(
        edits=[EditTextOperation(find="OldCompany Inc.", replace="Acme Corp")],
        page_numbers="all",
        use_regex=False,
        whole_word_search=False,
    )
    parameter_selector = RecordingParameterSelector([params])
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.EDIT_TEXT],
            summary="Update the company name to Acme Corp.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Update the company name to Acme Corp.",
            file_names=["agreement.pdf"],
            page_text=page_text,
        )
    )

    assert isinstance(response, EditPlanResponse)
    step = response.steps[0]
    assert step.tool == ToolEndpoint.EDIT_TEXT
    assert isinstance(step.parameters, EditTextParams)
    # The exact find string came from interpreting the user's intent against the extracted text.
    assert step.parameters.edits is not None
    assert step.parameters.edits[0].find == "OldCompany Inc."
    assert step.parameters.edits[0].replace == "Acme Corp"


@pytest.mark.anyio
async def test_pdf_edit_agent_composes_edit_text_with_other_operations(runtime: AppRuntime) -> None:
    """EDIT_TEXT can appear alongside other operations in a single plan."""
    edit_params = EditTextParams(
        edits=[EditTextOperation(find="DRAFT", replace="")],
        page_numbers="all",
        use_regex=False,
        whole_word_search=False,
    )
    parameter_selector = RecordingParameterSelector([edit_params, RotatePdfParams(angle=Angle(90))])
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[ToolEndpoint.EDIT_TEXT, ToolEndpoint.ROTATE_PDF],
            summary="Remove DRAFT marker, then rotate.",
        ),
        parameter_selector=parameter_selector,
    )

    response = await agent.handle(
        PdfEditRequest(
            user_message="Remove the DRAFT watermark text and then rotate.",
            file_names=["draft.pdf"],
        )
    )

    assert isinstance(response, EditPlanResponse)
    assert [step.tool for step in response.steps] == [
        ToolEndpoint.EDIT_TEXT,
        ToolEndpoint.ROTATE_PDF,
    ]
    assert isinstance(response.steps[0].parameters, EditTextParams)
    assert isinstance(response.steps[1].parameters, RotatePdfParams)
