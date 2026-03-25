from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    PdfQuestionAnswerResponse,
    PdfQuestionNeedTextResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
)
from stirling.services.runtime import AppRuntime


class PdfQuestionAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(
                [
                    PdfQuestionAnswerResponse,
                    PdfQuestionNotFoundResponse,
                ]
            ),
            system_prompt=(
                "Answer questions about a PDF using only the extracted text provided in the prompt. "
                "Do not guess or use outside knowledge. "
                "If the answer is not supported by the provided text, return not_found. "
                "When answering, include a short list of evidence snippets copied from the provided text."
            ),
            model_settings=runtime.smart_model_settings(),
        )

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        if not request.extracted_text.strip():
            return PdfQuestionNeedTextResponse(
                reason="No extracted PDF text was provided, so the question cannot be answered yet."
            )
        return await self._run_answer_agent(request)

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        result = await self.agent.run(self._build_prompt(request))
        return result.output

    def _build_prompt(self, request: PdfQuestionRequest) -> str:
        file_name = request.file_name or "Unknown file"
        return f"File: {file_name}\nQuestion: {request.question}\nExtracted text:\n{request.extracted_text}"
