"""Sub-agent for detecting sensitive/PII data in text."""

from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.models import ApiModel
from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class SensitiveMatch(ApiModel):
    """A single sensitive data match found in text."""

    text: str
    category: str
    start_index: int
    end_index: int
    confidence: float = Field(ge=0.0, le=1.0)


class SensitiveDataResult(ApiModel):
    """Result of sensitive data detection."""

    outcome: Literal["found"] = "found"
    matches: list[SensitiveMatch] = Field(default_factory=list)


class NoSensitiveDataResult(ApiModel):
    """No sensitive data was found."""

    outcome: Literal["clean"] = "clean"
    message: str = "No sensitive data detected."


class SensitiveDataDetector:
    """Detects sensitive data, PII, or user-specified content for redaction."""

    SYSTEM_PROMPT = (
        "You are a data detection and redaction expert. "
        "Your job is to find content in a document that should be redacted. "
        "The user will tell you what to look for. If they ask for 'sensitive data' or 'PII', "
        "look for: SSNs, credit card numbers, bank accounts, phone numbers, emails, "
        "addresses, dates of birth, passport numbers, and other PII. "
        "If they ask for something specific (e.g., 'dollar amounts', 'names', 'dates'), "
        "find ALL instances of that specific type of content. "
        "For each match, provide the EXACT text as it appears in the document, "
        "a category label, approximate character indices, and a confidence score. "
        "Be thorough — find every instance. Return the exact text so it can be used for search-and-redact."
    )

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput([SensitiveDataResult, NoSensitiveDataResult]),
            system_prompt=self.SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
        )

    async def handle(
        self,
        text: str,
        emitter: EventEmitter,
        parent_agent_id: str,
        user_instruction: str | None = None,
    ) -> SensitiveDataResult | NoSensitiveDataResult:
        agent_id = emitter.agent_start("Sensitive Data Detection", parent_agent_id)

        # Build the prompt with the user's specific instruction
        if user_instruction:
            prompt = (
                f"User request: {user_instruction}\n\n"
                f"Find all matching content in the following document text:\n\n{text}"
            )
        else:
            prompt = f"Find all sensitive data (PII) in this text:\n\n{text}"

        result = await self.agent.run(prompt)
        output = result.output

        if isinstance(output, SensitiveDataResult):
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
