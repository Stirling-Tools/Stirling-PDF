"""Auto Redact agent — detects sensitive information and triggers redaction."""

from __future__ import annotations

from stirling.agents.sub_agents import SensitiveDataDetector, TextExtractionSubAgent
from stirling.agents.sub_agents.sensitive_data import SensitiveDataResult
from stirling.contracts.chat import ChatRequest
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class AutoRedactAgent:
    """Detects sensitive information in a PDF and triggers auto-redaction.

    Composes: TextExtraction → SensitiveDataDetector → action_required for redaction.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.text_extraction = TextExtractionSubAgent()
        self.sensitive_detector = SensitiveDataDetector(runtime)

    async def handle(
        self,
        request: ChatRequest,
        emitter: EventEmitter,
        parent_agent_id: str | None = None,
    ) -> None:
        agent_id = emitter.agent_start("Auto Redact", parent_agent_id)

        text = await self.text_extraction.handle(
            request.extracted_text, emitter, agent_id
        )

        if not text:
            emitter.token(agent_id, "No document text was provided. Please upload a PDF to scan for sensitive data.")
            emitter.agent_complete(agent_id, status="error", result_summary="No text available")
            return

        detection_result = await self.sensitive_detector.handle(
            text, emitter, agent_id, user_instruction=request.message
        )

        if not isinstance(detection_result, SensitiveDataResult) or not detection_result.matches:
            emitter.token(agent_id, "No sensitive data was detected in this document. The document appears clean.")
            emitter.agent_complete(agent_id, status="success", result_summary="No sensitive data found")
            return

        # Build response listing found sensitive items
        response_parts = [f"## Sensitive Data Detected\n\nFound **{len(detection_result.matches)}** item(s) to redact:\n"]

        for i, match in enumerate(detection_result.matches, 1):
            # Mask most of the sensitive text for display
            display_text = match.text[:3] + "***" if len(match.text) > 3 else "***"
            response_parts.append(
                f"{i}. **{match.category}**: `{display_text}` (confidence: {match.confidence:.0%})"
            )

        response_parts.append("\n*Approve to redact these items from the document.*")

        full_response = "\n".join(response_parts)
        emitter.token(agent_id, full_response)

        # Emit action_required so the frontend can trigger redaction
        emitter.action_required(
            agent_id,
            action_type="auto_redact",
            action_payload={
                "matches": [m.model_dump(by_alias=True) for m in detection_result.matches],
                "fileNames": request.file_names,
            },
        )

        emitter.agent_complete(
            agent_id,
            status="success",
            result_summary=f"Found {len(detection_result.matches)} item(s) to redact",
        )
