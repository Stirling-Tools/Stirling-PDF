from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents._page_text import format_page_text, has_page_text
from stirling.contracts import (
    NeedContentFileRequest,
    NeedContentResponse,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    SupportedCapability,
    format_conversation_history,
)
from stirling.services import AppRuntime


class PdfQuestionAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        rag = runtime.rag_capability
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
            instructions=rag.instructions,
            toolsets=[rag.toolset],
            model_settings=runtime.smart_model_settings,
        )

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        if not has_page_text(request.page_text):
            return NeedContentResponse(
                resume_with=SupportedCapability.PDF_QUESTION,
                reason="No extracted PDF page text was provided, so the question cannot be answered yet.",
                files=[
                    NeedContentFileRequest(
                        file_name=file_name,
                        content_types=[PdfContentType.PAGE_TEXT],
                    )
                    for file_name in request.file_names
                ],
                max_pages=self.runtime.settings.max_pages,
                max_characters=self.runtime.settings.max_characters,
            )
        return await self._run_answer_agent(request)

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        result = await self.agent.run(self._build_prompt(request))
        return result.output

    def _build_prompt(self, request: PdfQuestionRequest) -> str:
        file_names = ", ".join(request.file_names) if request.file_names else "Unknown files"
        pages = format_page_text(request.page_text, empty="")
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"Files: {file_names}\n"
            f"Question: {request.question}\n"
            f"Extracted page text:\n{pages}"
        )
