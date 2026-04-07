"""Sub-agent for extracting text from PDF documents."""

from __future__ import annotations

from stirling.streaming import EventEmitter


class TextExtractionSubAgent:
    """Extracts text from PDF.

    Currently uses the ``extracted_text`` field provided by the caller
    (the frontend sends pre-extracted text).  Future versions may call
    a backend API endpoint to extract text on demand.
    """

    async def handle(
        self,
        extracted_text: str | None,
        emitter: EventEmitter,
        parent_agent_id: str,
    ) -> str:
        agent_id = emitter.agent_start("Text Extraction", parent_agent_id)

        if not extracted_text or not extracted_text.strip():
            emitter.agent_complete(agent_id, status="success", result_summary="Skipped — not needed")
            return ""

        word_count = len(extracted_text.split())
        emitter.agent_complete(
            agent_id,
            status="success",
            result_summary=f"Extracted {word_count:,} words",
        )
        return extracted_text
