from __future__ import annotations

import pytest

from stirling.agents import PdfQuestionAgent
from stirling.config import AppSettings
from stirling.contracts import (
    PdfQuestionAnswerResponse,
    PdfQuestionNeedTextResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfTextSelection,
)
from stirling.services import build_runtime


class StubPdfQuestionAgent(PdfQuestionAgent):
    def __init__(self, response: PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse) -> None:
        super().__init__(build_runtime(build_test_settings()))
        self.response = response

    async def _run_answer_agent(
        self,
        request: PdfQuestionRequest,
    ) -> PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse:
        return self.response


def build_test_settings() -> AppSettings:
    return AppSettings(
        smart_model_name="test",
        fast_model_name="test",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
    )


@pytest.mark.anyio
async def test_pdf_question_agent_requires_extracted_text() -> None:
    agent = PdfQuestionAgent(build_runtime(build_test_settings()))

    response = await agent.handle(PdfQuestionRequest(question="What is the total?", page_text=[]))

    assert isinstance(response, PdfQuestionNeedTextResponse)


@pytest.mark.anyio
async def test_pdf_question_agent_returns_grounded_answer() -> None:
    agent = StubPdfQuestionAgent(
        PdfQuestionAnswerResponse(
            answer="The invoice total is 120.00.",
            evidence=[PdfTextSelection(page_number=1, text="Invoice total: 120.00")],
        )
    )

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            page_text=[PdfTextSelection(page_number=1, text="Invoice total: 120.00")],
            file_name="invoice.pdf",
        )
    )

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == "The invoice total is 120.00."


@pytest.mark.anyio
async def test_pdf_question_agent_returns_not_found_when_text_is_insufficient() -> None:
    agent = StubPdfQuestionAgent(PdfQuestionNotFoundResponse(reason="The answer is not present in the text."))

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            page_text=[PdfTextSelection(page_number=1, text="This page contains only a shipping address.")],
            file_name="invoice.pdf",
        )
    )

    assert isinstance(response, PdfQuestionNotFoundResponse)
