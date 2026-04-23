from __future__ import annotations

import logging

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    AiFile,
    NeedIngestResponse,
    PdfContentType,
    SummaryAnswerResponse,
    SummaryNotFoundResponse,
    SummaryRequest,
    SummaryResponse,
    SummaryTerminalResponse,
    SupportedCapability,
    format_conversation_history,
    format_file_names,
)
from stirling.rag import RagCapability
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


SUMMARY_SYSTEM_PROMPT = (
    "You produce structured summaries of PDF documents. "
    "You MUST retrieve the document content via the search_knowledge tool before "
    "summarising. Do not rely on outside knowledge or the file names alone. "
    "Make multiple search_knowledge calls to cover the document broadly: for example, "
    "search for the introduction, the main arguments or topics, the conclusions, and any "
    "distinctive themes. If the user has provided a focus, prioritise searches around that focus. "
    "Return a tldr (1-2 sentences), a small list of key_points, and optional sections "
    "covering structurally distinct parts. "
    "If search_knowledge returns no relevant content, return not_found."
)


class SummaryAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: SummaryRequest) -> SummaryResponse:
        logger.info(
            "[summary] handle: files=%s focus=%r",
            [file.name for file in request.files],
            request.focus,
        )
        missing = await self._find_missing_files(request.files)
        if missing:
            logger.info("[summary] missing ingestions: %s", [file.name for file in missing])
            return NeedIngestResponse(
                resume_with=SupportedCapability.PDF_SUMMARY,
                reason="Some files have not been ingested into RAG yet.",
                files_to_ingest=missing,
                content_types=[PdfContentType.PAGE_TEXT],
            )
        return await self._run_summary_agent(request)

    async def _find_missing_files(self, files: list[AiFile]) -> list[AiFile]:
        missing: list[AiFile] = []
        for file in files:
            if not await self.runtime.rag_service.has_collection(file.id):
                missing.append(file)
        return missing

    async def _run_summary_agent(self, request: SummaryRequest) -> SummaryTerminalResponse:
        rag = RagCapability(
            rag_service=self.runtime.rag_service,
            collections=[file.id for file in request.files],
            top_k=self.runtime.settings.rag_default_top_k,
        )
        agent = Agent(
            model=self.runtime.smart_model,
            output_type=NativeOutput([SummaryAnswerResponse, SummaryNotFoundResponse]),
            system_prompt=SUMMARY_SYSTEM_PROMPT,
            instructions=rag.instructions,
            toolsets=[rag.toolset],
            model_settings=self.runtime.smart_model_settings,
        )
        result = await agent.run(self._build_prompt(request))
        return result.output

    def _build_prompt(self, request: SummaryRequest) -> str:
        focus_line = f"Focus: {request.focus}" if request.focus else "Focus: none (produce a broad summary)"
        return (
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n"
            f"Files to summarise: {format_file_names(request.files)}\n"
            f"{focus_line}\n"
            "Use search_knowledge to retrieve content from the listed files, "
            "then produce the structured summary."
        )
