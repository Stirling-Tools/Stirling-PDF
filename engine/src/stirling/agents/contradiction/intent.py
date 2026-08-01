"""Intent classifier for the contradiction agent.

Mirrors :class:`stirling.agents.math_presentation.MathIntentClassifier`
so review delegates can route both signals through the same shape.
A tiny LLM call rather than an English regex - the prompt may be in
any language.

Only the review path uses this classifier; the question path lets the
smart model decide via the ``find_contradictions`` tool.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.contradiction.prompts import SECURITY_PREAMBLE
from stirling.models import ApiModel
from stirling.services import AppRuntime

_CONTRADICTION_INTENT_SYSTEM_PROMPT = (
    f"{SECURITY_PREAMBLE}\n"
    "\n"
    "Decide whether the user's prompt (wrapped in <user_message> tags) "
    "is asking for detection of textual contradictions, inconsistencies, "
    "or conflicts between claims, recommendations, opinions, deadlines, "
    "or assertions in the document. This is about LOGICAL/TEXTUAL "
    "conflicts (e.g. page 1 says approve and page 5 says reject), NOT "
    "numerical math errors. Set is_contradiction=true if so, otherwise "
    "false. Decide from the meaning of the prompt, not specific "
    "keywords; the prompt may be in any language."
)


class _ContradictionIntentDecision(ApiModel):
    is_contradiction: bool = Field(
        description=(
            "True if the prompt is asking about textual contradictions, "
            "inconsistencies, or logical conflicts in the document."
        ),
    )


class ContradictionIntentClassifier:
    """Tiny LLM classifier that returns whether a prompt needs the contradiction agent."""

    def __init__(self, runtime: AppRuntime) -> None:
        self._agent: Agent[None, _ContradictionIntentDecision] = Agent(
            model=runtime.fast_model,
            output_type=_ContradictionIntentDecision,
            system_prompt=_CONTRADICTION_INTENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def classify(self, user_message: str) -> bool:
        if not user_message.strip():
            return False
        prompt = f"<user_message>{user_message}</user_message>"
        result = await self._agent.run(prompt)
        return result.output.is_contradiction
