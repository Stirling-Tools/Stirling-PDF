"""Sub-agent for detecting content to redact based on user instructions."""

from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.models import ApiModel
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class RedactionMatch(ApiModel):
    """A single piece of content matched for redaction."""

    text: str
    category: str
    start_index: int
    end_index: int
    confidence: float = Field(ge=0.0, le=1.0)


class ContentFoundResult(ApiModel):
    """Content matching the user's redaction criteria was found."""

    outcome: Literal["found"] = "found"
    matches: list[RedactionMatch] = Field(default_factory=list)


class ContentNotFoundResult(ApiModel):
    """No content matching the user's criteria was found."""

    outcome: Literal["clean"] = "clean"
    message: str = "No matching content found."


class ContentDetector:
    """Detects content to redact based on the user's natural-language instructions.

    Handles any redaction request: specific patterns (8-digit numbers, emails),
    semantic categories (names, addresses, financial data), or broad requests
    (all PII, all sensitive information).
    """

    SYSTEM_PROMPT = (
        "You are a document content detector for a redaction tool. "
        "The user will describe what they want redacted. Your job is to find "
        "EVERY instance of matching content in the document.\n\n"
        "Examples of what users may ask to redact:\n"
        "- Specific patterns: 'all 8-digit numbers', 'email addresses', 'phone numbers'\n"
        "- Named entities: 'all names', 'company names', 'locations'\n"
        "- Semantic categories: 'financial data', 'PII', 'sensitive information', 'dates'\n"
        "- Custom criteria: 'words starting with p', 'dollar amounts over $1000', 'anything in brackets'\n\n"
        "For each match, return:\n"
        "- The EXACT text as it appears in the document (used for search-and-replace)\n"
        "- A short category label\n"
        "- Approximate character indices\n"
        "- A confidence score (0.0–1.0)\n\n"
        "Be thorough — find every instance. Return exact text so it can be used for search-and-redact."
    )

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput([ContentFoundResult, ContentNotFoundResult]),
            system_prompt=self.SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )

    async def handle(
        self,
        text: str,
        emitter: EventEmitter,
        parent_agent_id: str,
        user_instruction: str,
    ) -> ContentFoundResult | ContentNotFoundResult:
        agent_id = emitter.agent_start("Content Detection", parent_agent_id)

        prompt = (
            f"User's redaction request: {user_instruction}\n\n"
            f"Find all matching content in the following document text:\n\n{text}"
        )

        result = await self.agent.run(prompt)
        output = result.output

        if isinstance(output, ContentFoundResult):
            emitter.agent_complete(
                agent_id,
                status="success",
                result_summary=f"Found {len(output.matches)} item(s)",
            )
        else:
            emitter.agent_complete(
                agent_id,
                status="success",
                result_summary="No matching content found",
            )
        return output
