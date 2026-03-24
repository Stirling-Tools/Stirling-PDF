from __future__ import annotations

from dataclasses import dataclass

import pytest

from stirling.agents.pdf_edit import PdfEditAgent, PdfEditParameterSelector, PdfEditPlanSelection
from stirling.config.settings import AppSettings
from stirling.contracts import (
    EditCannotDoResponse,
    EditClarificationRequest,
    EditOperationPlanStep,
    EditPlanResponse,
    PdfEditRequest,
)
from stirling.models.tool_models import CompressParams, OperationId, RotateParams
from stirling.services.runtime import build_runtime


def build_test_settings() -> AppSettings:
    return AppSettings(
        anthropic_api_key="",
        openai_api_key="",
        openai_base_url=None,
        smart_model_name="test",
        fast_model_name="test",
        smart_model_reasoning_effort="medium",
        fast_model_reasoning_effort="minimal",
        smart_model_text_verbosity="medium",
        fast_model_text_verbosity="low",
        ai_max_tokens=None,
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        claude_max_tokens=4096,
        default_model_max_tokens=4096,
        posthog_api_key="",
        posthog_host="https://eu.i.posthog.com",
        java_backend_url="http://localhost:8080",
        java_backend_api_key="test-key",
        java_request_timeout_seconds=30,
        raw_debug=False,
        flask_debug=False,
        log_path=None,
        pdf_editor_table_debug=False,
        pdf_tauri_mode=False,
        ai_streaming=True,
        ai_preview_max_inflight=3,
        ai_request_timeout=70,
    )


@dataclass(frozen=True)
class ParameterSelectorCall:
    request: PdfEditRequest
    operation_plan: list[OperationId]
    operation_index: int
    generated_steps: list[EditOperationPlanStep]


class RecordingParameterSelector:
    def __init__(self) -> None:
        self.calls: list[ParameterSelectorCall] = []

    async def select(
        self,
        request: PdfEditRequest,
        operation_plan: list[OperationId],
        operation_index: int,
        generated_steps: list[EditOperationPlanStep],
    ) -> RotateParams | CompressParams:
        self.calls.append(
            ParameterSelectorCall(
                request=request,
                operation_plan=operation_plan,
                operation_index=operation_index,
                generated_steps=list(generated_steps),
            )
        )
        if operation_index == 0:
            return RotateParams(angle=90)
        return CompressParams(compression_level=5)


class StubPdfEditAgent(PdfEditAgent):
    def __init__(
        self,
        selection: PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse,
        parameter_selector: RecordingParameterSelector | PdfEditParameterSelector | None = None,
    ) -> None:
        super().__init__(build_runtime(build_test_settings()))
        self.selection = selection
        if parameter_selector is not None:
            self.parameter_selector = parameter_selector

    async def _select_plan(
        self,
        request: PdfEditRequest,
    ) -> PdfEditPlanSelection | EditClarificationRequest | EditCannotDoResponse:
        return self.selection


@pytest.mark.anyio
async def test_pdf_edit_agent_builds_multi_step_plan() -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        PdfEditPlanSelection(
            operations=[OperationId.ROTATE, OperationId.COMPRESS],
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
    assert [step.tool for step in response.steps] == [OperationId.ROTATE, OperationId.COMPRESS]
    assert isinstance(response.steps[0].parameters, RotateParams)
    assert isinstance(response.steps[1].parameters, CompressParams)


@pytest.mark.anyio
async def test_pdf_edit_agent_passes_previous_steps_to_parameter_selector() -> None:
    parameter_selector = RecordingParameterSelector()
    agent = StubPdfEditAgent(
        PdfEditPlanSelection(
            operations=[OperationId.ROTATE, OperationId.COMPRESS],
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
        EditOperationPlanStep(
            tool=OperationId.ROTATE,
            parameters=RotateParams(angle=90),
        )
    ]


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_clarification_without_partial_plan() -> None:
    agent = StubPdfEditAgent(
        EditClarificationRequest(
            question="Which pages should be rotated?",
            reason="The request does not say which pages to change.",
        )
    )

    response = await agent.handle(PdfEditRequest(user_message="Rotate some pages."))

    assert isinstance(response, EditClarificationRequest)


@pytest.mark.anyio
async def test_pdf_edit_agent_returns_cannot_do_without_partial_plan() -> None:
    agent = StubPdfEditAgent(
        EditCannotDoResponse(
            reason="This request requires OCR, which is not part of PDF edit planning.",
        )
    )

    response = await agent.handle(PdfEditRequest(user_message="Read this scan and summarize it."))

    assert isinstance(response, EditCannotDoResponse)
