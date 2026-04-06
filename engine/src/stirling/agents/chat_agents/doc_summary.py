"""Document Summary agent — extracts text then summarizes it."""

from __future__ import annotations

from stirling.agents.sub_agents import SummarizationSubAgent, TextExtractionSubAgent
from stirling.contracts.chat import ChatRequest
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class DocSummaryAgent:
    """Summarizes a PDF document using text extraction and AI summarization."""

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.text_extraction = TextExtractionSubAgent()
        self.summarization = SummarizationSubAgent(runtime)

    async def handle(
        self,
        request: ChatRequest,
        emitter: EventEmitter,
        parent_agent_id: str | None = None,
    ) -> None:
        agent_id = emitter.agent_start("Document Summary", parent_agent_id)

        text = await self.text_extraction.handle(
            request.extracted_text, emitter, agent_id
        )

        if not text:
            emitter.token(agent_id, "No document text was provided. Please upload a PDF to summarize.")
            emitter.agent_complete(agent_id, status="error", result_summary="No text available")
            return

        await self.summarization.handle(
            text, emitter, agent_id, user_instruction=request.message
        )

        emitter.agent_complete(agent_id, status="success", result_summary="Summary complete")
