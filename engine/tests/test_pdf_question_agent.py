from __future__ import annotations

import pytest

from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.config.settings import AppSettings
from stirling.contracts import (
    PdfQuestionAnswerResponse,
    PdfQuestionNeedOcrResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
)
from stirling.services.runtime import build_runtime


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


@pytest.mark.anyio
async def test_pdf_question_agent_requires_extracted_text() -> None:
    agent = PdfQuestionAgent(build_runtime(build_test_settings()))

    response = await agent.handle(PdfQuestionRequest(question="What is the total?", extracted_text=""))

    assert isinstance(response, PdfQuestionNeedOcrResponse)


@pytest.mark.anyio
async def test_pdf_question_agent_returns_grounded_answer() -> None:
    agent = StubPdfQuestionAgent(
        PdfQuestionAnswerResponse(
            answer="The invoice total is 120.00.",
            evidence=["Invoice total: 120.00"],
        )
    )

    response = await agent.handle(
        PdfQuestionRequest(
            question="What is the total?",
            extracted_text="Invoice total: 120.00",
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
            extracted_text="This page contains only a shipping address.",
            file_name="invoice.pdf",
        )
    )

    assert isinstance(response, PdfQuestionNotFoundResponse)
