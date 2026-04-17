from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    ExtractedFileText,
    NeedContentFileRequest,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNeedContentResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    format_conversation_history,
)
from stirling.services import AppRuntime


class PdfQuestionAgent:
    DEFAULT_MAX_PAGES = 12
    DEFAULT_MAX_CHARACTERS = 24_000

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
                "Answer questions about PDFs using only the extracted page text provided in the prompt. "
                "Do not guess or use outside knowledge. "
                "If the answer is not supported by the provided text, return not_found. "
                "When answering, include a short list of evidence snippets with their page numbers."
            ),
            model_settings=runtime.smart_model_settings,
        )

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        if not self._has_page_text(request.page_text):
            return PdfQuestionNeedContentResponse(
                reason="No extracted PDF page text was provided, so the question cannot be answered yet.",
                files=[
                    NeedContentFileRequest(
                        file_name=file_name,
                        content_types=[PdfContentType.PAGE_TEXT],
                    )
                    for file_name in request.file_names
                ],
                max_pages=self.DEFAULT_MAX_PAGES,
                max_characters=self.DEFAULT_MAX_CHARACTERS,
            )
        return await self._run_answer_agent(request)

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        result = await self.agent.run(self._build_prompt(request))
        return result.output

    def _build_prompt(self, request: PdfQuestionRequest) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "Unknown files"
        sections = [
            f"[File: {file_text.file_name}, Page {selection.page_number or '?'}]\n{selection.text}"
            for file_text in request.page_text
            for selection in file_text.pages
        ]
        pages = "\n\n".join(sections)
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"Files: {file_names}\n"
            f"Question: {request.question}\n"
            f"Extracted page text:\n{pages}"
        )

    def _has_page_text(self, page_text: list[ExtractedFileText]) -> bool:
        return any(selection.text.strip() for file_text in page_text for selection in file_text.pages)
