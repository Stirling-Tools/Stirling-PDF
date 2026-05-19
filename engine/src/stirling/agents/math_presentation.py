"""
Math-auditor presentation helpers.

Used by ``PdfQuestionAgent`` and ``PdfReviewAgent`` to (a) decide whether
a request needs the math auditor at all, and (b) pull a Verdict back out
of the resume-turn artifacts.

Intent classification is language-agnostic — a small LLM call rather than
an English regex — so a request like "vérifiez les totaux" routes to the
math path the same as "check the totals".
"""

from __future__ import annotations

from pydantic import Field
from pydantic_ai import Agent

from stirling.contracts import (
    MathAuditorToolReportArtifact,
    OrchestratorRequest,
    Verdict,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime


def extract_math_verdict(request: OrchestratorRequest) -> Verdict | None:
    """Find a math-auditor Verdict in the request's artifacts, if any.

    Meta-agents call this on resume to detect whether the specialist has
    already run. The Verdict is already type-validated by the time it lands
    in :class:`MathAuditorToolReportArtifact` — pydantic rejected the whole
    request earlier if the payload was malformed.
    """
    for artifact in request.artifacts:
        if isinstance(artifact, MathAuditorToolReportArtifact):
            return artifact.report
    return None


_MATH_INTENT_SYSTEM_PROMPT = (
    "Decide whether the user's prompt is asking for verification of "
    "numerical content — math correctness, audit, recalculation, totals, "
    "sums, percentages, balances, arithmetic, or financial figures. "
    "Set is_math=true if so, otherwise false. Decide from the meaning of "
    "the prompt, not specific keywords; the prompt may be in any language."
)


class _MathIntentDecision(ApiModel):
    is_math: bool = Field(
        description=(
            "True if the prompt is about verifying numerical content "
            "(math, audit, calculations, totals, percentages, etc.)."
        ),
    )


class MathIntentClassifier:
    """Tiny LLM classifier that returns whether a prompt needs the math auditor.

    Shared between ``PdfQuestionAgent`` and ``PdfReviewAgent`` so both delegates
    use the same decision shape and prompt. One agent instance per consumer
    (cheap; matches the existing pattern of per-request agent construction).
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self._agent: Agent[None, _MathIntentDecision] = Agent(
            model=runtime.fast_model,
            output_type=_MathIntentDecision,
            system_prompt=_MATH_INTENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def classify(self, user_message: str) -> bool:
        if not user_message:
            return False
        result = await self._agent.run(user_message)
        return result.output.is_math
