from __future__ import annotations

import logging

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    AiFile,
    NeedIngestResponse,
    PdfContentType,
    PdfQuestionAnswerResponse,
    PdfQuestionNotFoundResponse,
    PdfQuestionRequest,
    PdfQuestionResponse,
    PdfQuestionTerminalResponse,
    SupportedCapability,
    format_conversation_history,
    format_file_names,
)
from stirling.rag import RagCapability
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


PDF_QUESTION_SYSTEM_PROMPT = (
    "You answer questions about PDF documents by retrieving relevant content with the "
    "search_knowledge tool. Use it before answering. Do not guess or use outside knowledge.\n"
    "\n"
    "Guidelines:\n"
    "- Make one or two targeted search_knowledge calls based on the user's question. "
    "Only search more if you genuinely need more context.\n"
    "- Answer from the retrieved text. If the text doesn't support an answer, return not_found.\n"
    "- Include a short list of evidence snippets (with page numbers where available) drawn "
    "from what search_knowledge returned."
)


class PdfQuestionAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        logger.info(
            "[pdf-question] handle: files=%s question=%r",
            [file.name for file in request.files],
            request.question,
        )
        missing = await self._find_missing_files(request.files)
        if missing:
            logger.info("[pdf-question] missing ingestions: %s", [file.name for file in missing])
            return NeedIngestResponse(
                resume_with=SupportedCapability.PDF_QUESTION,
                reason="Some files have not been ingested into RAG yet.",
                files_to_ingest=missing,
                content_types=[PdfContentType.PAGE_TEXT],
            )
        return await self._run_answer_agent(request)

    async def _find_missing_files(self, files: list[AiFile]) -> list[AiFile]:
        missing: list[AiFile] = []
        for file in files:
            if not await self.runtime.rag_service.has_collection(file.id):
                missing.append(file)
        return missing

    async def _run_answer_agent(self, request: PdfQuestionRequest) -> PdfQuestionTerminalResponse:
        rag = RagCapability(
            rag_service=self.runtime.rag_service,
            collections=[file.id for file in request.files],
            top_k=self.runtime.settings.rag_default_top_k,
        )
        agent = Agent(
            model=self.runtime.smart_model,
            output_type=NativeOutput([PdfQuestionAnswerResponse, PdfQuestionNotFoundResponse]),
            system_prompt=PDF_QUESTION_SYSTEM_PROMPT,
            instructions=rag.instructions,
            toolsets=[rag.toolset],
            model_settings=self.runtime.smart_model_settings,
        )
        prompt = self._build_prompt(request)
        logger.debug("[pdf-question] prompt:\n%s", prompt)
        result = await agent.run(prompt)
        return result.output

    def _build_prompt(self, request: PdfQuestionRequest) -> str:
        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n"
            f"Files: {format_file_names(request.files)}\n"
            f"Question: {request.question}\n"
            "Use search_knowledge to retrieve the relevant content, then answer."
        )
