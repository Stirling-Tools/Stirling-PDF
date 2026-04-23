from __future__ import annotations

import logging

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    NeedIngestResponse,
    PdfContentType,
    SummaryAnswerResponse,
    SummaryNotFoundResponse,
    SummaryRequest,
    SummaryResponse,
    SummaryTerminalResponse,
    SupportedCapability,
    format_conversation_history,
)
from stirling.rag import RagCapability
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


SUMMARY_SYSTEM_PROMPT = (
    "You produce structured summaries of PDF documents. "
    "You MUST retrieve the document content via the search_knowledge tool before summarising — "
    "do not rely on outside knowledge or the document_ids alone. "
    "Make multiple search_knowledge calls to cover the document broadly: for example, "
    "search for the introduction, the main arguments or topics, the conclusions, and any "
    "distinctive themes. If the user has provided a focus, prioritise searches around that focus. "
    "Return a tldr (1-2 sentences), a small list of key_points, and optional sections "
    "covering structurally distinct parts. "
    "If search_knowledge returns no relevant content, return not_found."
)


def _collection_for(document_id: str) -> str:
    """Mirror of ``api.routes.rag._collection_for`` — kept in lockstep."""
    return document_id


class SummaryAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: SummaryRequest) -> SummaryResponse:
        logger.info("[summary] handle: docs=%s focus=%r", request.document_ids, request.focus)
        collections = [_collection_for(doc_id) for doc_id in request.document_ids]
        missing_ids = await self._find_missing_document_ids(request.document_ids, collections)
        if missing_ids:
            logger.info("[summary] missing doc ingestions: %s", missing_ids)
            return NeedIngestResponse(
                resume_with=SupportedCapability.PDF_SUMMARY,
                reason="Some documents have not been ingested into RAG yet.",
                document_ids=missing_ids,
                content_types=[PdfContentType.PAGE_TEXT],
            )
        return await self._run_summary_agent(request, collections)

    async def _find_missing_document_ids(
        self,
        document_ids: list[str],
        collections: list[str],
    ) -> list[str]:
        missing: list[str] = []
        for doc_id, collection in zip(document_ids, collections):
            if not await self.runtime.rag_service.has_collection(collection):
                missing.append(doc_id)
        return missing

    async def _run_summary_agent(
        self,
        request: SummaryRequest,
        collections: list[str],
    ) -> SummaryTerminalResponse:
        rag = RagCapability(
            rag_service=self.runtime.rag_service,
            collections=collections,
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
        doc_list = ", ".join(request.document_ids)
        focus_line = f"Focus: {request.focus}" if request.focus else "Focus: none (produce a broad summary)"
        return (
            f"Conversation history:\n{format_conversation_history(request.conversation_history)}\n"
            f"Documents to summarise: {doc_list}\n"
            f"{focus_line}\n"
            "Use search_knowledge to retrieve content from the listed documents, "
            "then produce the structured summary."
        )
