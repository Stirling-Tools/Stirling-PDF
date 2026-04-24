from __future__ import annotations

import pytest

from stirling.agents import PdfQuestionAgent
from stirling.contracts import (
    AiFile,
    ExtractedFileText,
    NeedContentResponse,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfTextSelection,
)
from stirling.models import FileId
from stirling.services.runtime import AppRuntime


class StubPdfQuestionAgent(PdfQuestionAgent):
    def __init__(self, runtime: AppRuntime, response: PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse) -> None:
        super().__init__(runtime)
        self.response = response

    async def _run_answer_agent(
        self,
        request: PdfQuestionRequest,
    ) -> PdfQuestionAnswerResponse | PdfQuestionNotFoundResponse:
        return self.response


def invoice_page() -> ExtractedFileText:
    return ExtractedFileText(
        file_name="invoice.pdf",
        pages=[PdfTextSelection(page_number=1, text="Invoice total: 120.00")],
    )


@pytest.mark.anyio
async def test_pdf_question_agent_requires_extracted_text(runtime: AppRuntime) -> None:
    agent = PdfQuestionAgent(runtime)

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            page_text=[],
            files=[AiFile(id=FileId("test-id"), name="test.pdf")],
        )
    )

    assert isinstance(response, NeedContentResponse)


@pytest.mark.anyio
async def test_pdf_question_agent_returns_grounded_answer(runtime: AppRuntime) -> None:
    agent = StubPdfQuestionAgent(
        runtime,
        PdfQuestionAnswerResponse(
            answer="The invoice total is 120.00.",
            evidence=[invoice_page()],
        ),
    )

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            page_text=[invoice_page()],
            files=[AiFile(id=FileId("invoice-id"), name="invoice.pdf")],
        )
    )

    assert isinstance(response, PdfQuestionAnswerResponse)
    assert response.answer == "The invoice total is 120.00."


@pytest.mark.anyio
async def test_pdf_question_agent_returns_not_found_when_text_is_insufficient(runtime: AppRuntime) -> None:
    agent = StubPdfQuestionAgent(runtime, PdfQuestionNotFoundResponse(reason="The answer is not present in the text."))

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            page_text=[
                ExtractedFileText(
                    file_name="invoice.pdf",
                    pages=[PdfTextSelection(page_number=1, text="This page contains only a shipping address.")],
                )
            ],
            files=[AiFile(id=FileId("invoice-id"), name="invoice.pdf")],
        )
    )

    assert isinstance(response, PdfQuestionNotFoundResponse)
