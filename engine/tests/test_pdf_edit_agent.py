from __future__ import annotations

from dataclasses import dataclass

import pytest

from stirling.agents import PdfEditAgent, PdfEditParameterSelector, PdfEditPlanSelection
from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditPlanResponse,
    PdfEditRequest,
    ToolOperationStep,
)
from stirling.models.tool_models import CompressPdfParams, OperationId, RotatePdfParams
from stirling.services.runtime import AppRuntime


@dataclass(frozen=True)
class ParameterSelectorCall:
    request: PdfEditRequest
    operation_plan: list[OperationId]
    operation_index: int
    generated_steps: list[ToolOperationStep]


class RecordingParameterSelector:
    def __init__(self) -> None:
        self.calls: list[ParameterSelectorCall] = []

    async def select(
        self,
        request: PdfEditRequest,
        operation_plan: list[OperationId],
        operation_index: int,
        generated_steps: list[ToolOperationStep],
    ) -> RotatePdfParams | CompressPdfParams:
        self.calls.append(
            ParameterSelectorCall(
                request=request,
                operation_plan=operation_plan,
                operation_index=operation_index,
                generated_steps=list(generated_steps),
            )
        )
        if operation_index == 0:
            return RotatePdfParams(angle=90)
        return CompressPdfParams(optimize_level=5)


class StubPdfEditAgent(PdfEditAgent):
    def __init__(
        self,
        runtime: AppRuntime,
        selection: PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse,
        parameter_selector: RecordingParameterSelector | PdfEditParameterSelector | None = None,
    ) -> None:
        super().__init__(runtime)
        self.selection = selection
        if parameter_selector is not None:
            self.parameter_selector = parameter_selector

    async def _select_plan(
        self,
        request: PdfEditRequest,
    ) -> PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse:
        return self.selection


@pytest.mark.anyio
async def test_pdf_edit_agent_builds_multi_step_plan(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[OperationId.ROTATE_PDF, OperationId.COMPRESS_PDF],
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
    assert [step.tool for step in response.steps] == [OperationId.ROTATE_PDF, OperationId.COMPRESS_PDF]
    assert isinstance(response.steps[0].parameters, RotatePdfParams)
    assert isinstance(response.steps[1].parameters, CompressPdfParams)


@pytest.mark.anyio
async def test_pdf_edit_agent_passes_previous_steps_to_parameter_selector(runtime: AppRuntime) -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        runtime,
        PdfEditPlanSelection(
            operations=[OperationId.ROTATE_PDF, OperationId.COMPRESS_PDF],
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
            tool=OperationId.ROTATE_PDF,
            parameters=RotatePdfParams(angle=90),
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
