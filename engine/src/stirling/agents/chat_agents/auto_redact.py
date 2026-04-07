"""Auto Redact agent — finds content matching the user's criteria and triggers redaction."""

from __future__ import annotations

import re

from typing import Literal

from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.agents.sub_agents import ContentDetector
from stirling.agents.sub_agents.content_detector import ContentFoundResult, RedactionMatch
from stirling.contracts.chat import ChatRequest
from stirling.models import ApiModel
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


# ---------------------------------------------------------------------------
# Strategy classifier: does the user want regex or LLM-based detection?
# ---------------------------------------------------------------------------


class RegexStrategy(ApiModel):
    """The request can be fulfilled with a regular expression."""

    strategy: Literal["regex"] = "regex"
    pattern: str
    """A Python-flavour regex that matches the content to redact."""
    category: str
    """A short human-readable label for the matched content (e.g. '8-digit number')."""


class LLMStrategy(ApiModel):
    """The request requires semantic understanding (names, financial data, etc.)."""

    strategy: Literal["llm"] = "llm"


STRATEGY_SYSTEM_PROMPT = (
    "Decide whether a redaction request can be handled with a simple regex or "
    "needs an LLM to understand the document.\n\n"
    "Return **regex** with a Python regex pattern when the request describes a "
    "mechanical text pattern. Examples:\n"
    '- "all 8-digit numbers" → regex r"\\b\\d{8}\\b"\n'
    '- "email addresses" → regex r"[\\w.+-]+@[\\w-]+\\.[\\w.-]+"\n'
    '- "words beginning with lowercase p" → regex r"\\bp\\w+"\n'
    '- "phone numbers" → regex r"\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}"\n'
    '- "anything in square brackets" → regex r"\\[.*?\\]"\n\n'
    "Return **llm** when the request requires semantic understanding. Examples:\n"
    '- "all names" (needs NER)\n'
    '- "financial data" (needs understanding of context)\n'
    '- "sensitive information" / "PII" (broad semantic category)\n'
    '- "company names and addresses" (entity recognition)\n\n'
    "When in doubt, prefer llm."
)


class AutoRedactAgent:
    """Finds content matching the user's redaction criteria and triggers auto-redaction.

    Supports two detection strategies:
    - **Regex**: For pattern-based requests (8-digit numbers, emails, words matching a rule)
    - **LLM**: For semantic requests (names, financial data, PII, custom categories)

    The agent classifies the request first, then applies the appropriate strategy.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.content_detector = ContentDetector(runtime)
        self.strategy_agent = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput([RegexStrategy, LLMStrategy]),
            system_prompt=STRATEGY_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def handle(
        self,
        request: ChatRequest,
        emitter: EventEmitter,
        parent_agent_id: str | None = None,
    ) -> None:
        agent_id = emitter.agent_start("Auto Redact", parent_agent_id)

        text = request.extracted_text
        if not text:
            emitter.token(agent_id, "No document text available. Please upload a PDF so I can search it.")
            emitter.agent_complete(agent_id, status="error", result_summary="No text available")
            return

        # Classify strategy
        strategy_result = await self.strategy_agent.run(request.message)
        strategy = strategy_result.output

        if isinstance(strategy, RegexStrategy):
            matches = self._run_regex(text, strategy)
            strategy_label = f"Regex: `{strategy.pattern}`"
        else:
            detection = await self.content_detector.handle(
                text, emitter, agent_id, user_instruction=request.message
            )
            if not isinstance(detection, ContentFoundResult) or not detection.matches:
                emitter.token(agent_id, "No matching content was found in this document.")
                emitter.agent_complete(agent_id, status="success", result_summary="No matches found")
                return
            matches = detection.matches
            strategy_label = "AI content detection"

        if not matches:
            emitter.token(agent_id, "No matching content was found in this document.")
            emitter.agent_complete(agent_id, status="success", result_summary="No matches found")
            return

        # Build response
        response_parts = [
            f"## Content Found\n\n"
            f"Found **{len(matches)}** item(s) to redact "
            f"(via {strategy_label}):\n"
        ]

        for i, match in enumerate(matches, 1):
            display_text = match.text[:3] + "***" if len(match.text) > 3 else "***"
            response_parts.append(
                f"{i}. **{match.category}**: `{display_text}` (confidence: {match.confidence:.0%})"
            )

        response_parts.append("\n*Approve to redact these items from the document.*")

        emitter.token(agent_id, "\n".join(response_parts))

        emitter.action_required(
            agent_id,
            action_type="auto_redact",
            action_payload={
                "matches": [m.model_dump(by_alias=True) for m in matches],
                "fileNames": request.file_names,
            },
        )

        emitter.agent_complete(
            agent_id,
            status="success",
            result_summary=f"Found {len(matches)} item(s) to redact",
        )

    def _run_regex(self, text: str, strategy: RegexStrategy) -> list[RedactionMatch]:
        """Run a regex pattern against the document text and return matches."""
        try:
            compiled = re.compile(strategy.pattern)
        except re.error:
            return []

        matches: list[RedactionMatch] = []
        seen: set[str] = set()

        for m in compiled.finditer(text):
            matched_text = m.group()
            if not matched_text.strip():
                continue
            # Deduplicate identical text values
            if matched_text in seen:
                continue
            seen.add(matched_text)
            matches.append(
                RedactionMatch(
                    text=matched_text,
                    category=strategy.category,
                    start_index=m.start(),
                    end_index=m.end(),
                    confidence=1.0,
                )
            )
        return matches
