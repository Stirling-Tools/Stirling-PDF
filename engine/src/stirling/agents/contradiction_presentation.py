"""
Contradiction-agent presentation helpers.

Used by ``PdfQuestionAgent`` and ``PdfReviewAgent`` to (a) decide
whether a request needs the contradiction agent at all, and (b) pull a
:class:`ContradictionVerdict` back out of the resume-turn artifacts.

Intent classification is language-agnostic — a small LLM call rather
than an English regex — so a request like "y a-t-il des contradictions"
routes to the contradiction path the same as "are there contradictions".
"""

from __future__ import annotations

from pydantic import Field
from pydantic_ai import Agent

from stirling.contracts import (
    ContradictionToolReportArtifact,
    ContradictionVerdict,
    OrchestratorRequest,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime


def extract_contradiction_verdict(request: OrchestratorRequest) -> ContradictionVerdict | None:
    """Find a contradiction-agent verdict in the request's artifacts, if any.

    Meta-agents call this on resume to detect whether the specialist has
    already run. The verdict is type-validated by the time it lands in
    :class:`ContradictionToolReportArtifact` — pydantic rejected the
    whole request earlier if the payload was malformed.
    """
    for artifact in request.artifacts:
        if isinstance(artifact, ContradictionToolReportArtifact):
            return artifact.report
    return None


_CONTRADICTION_INTENT_SYSTEM_PROMPT = (
    "Decide whether the user's prompt is asking for detection of "
    "textual contradictions, inconsistencies, or conflicts between "
    "claims, recommendations, opinions, deadlines, or assertions in "
    "the document. This is about LOGICAL/TEXTUAL conflicts (e.g. "
    "page 1 says approve and page 5 says reject), NOT numerical math "
    "errors. Set is_contradiction=true if so, otherwise false. Decide "
    "from the meaning of the prompt, not specific keywords; the prompt "
    "may be in any language."
)


class _ContradictionIntentDecision(ApiModel):
    is_contradiction: bool = Field(
        description=(
            "True if the prompt is asking about textual contradictions, "
            "inconsistencies, or logical conflicts in the document."
        ),
    )


class ContradictionIntentClassifier:
    """Tiny LLM classifier that returns whether a prompt needs the contradiction agent.

    Mirrors :class:`stirling.agents.math_presentation.MathIntentClassifier`
    so review and question delegates can route both signals through the
    same shape.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self._agent: Agent[None, _ContradictionIntentDecision] = Agent(
            model=runtime.fast_model,
            output_type=_ContradictionIntentDecision,
            system_prompt=_CONTRADICTION_INTENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def classify(self, user_message: str) -> bool:
        if not user_message:
            return False
        result = await self._agent.run(user_message)
        return result.output.is_contradiction
