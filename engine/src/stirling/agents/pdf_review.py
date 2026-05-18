"""PDF review delegate.

Produces an annotated PDF with review comments. Math-flavoured prompts
consult the math-auditor specialist first (via a plan + resume) and then
project the :class:`Verdict` into sticky-note specs for ``add-comments``.
Other review prompts route to the composed ``pdf-comment-agent`` tool,
which does its own chunk extraction + AI round-trip.

Sticky-note text is produced by a small LLM that reads the structured
Verdict and the user's original prompt and writes comments in the SAME
LANGUAGE as the prompt. Bounding-box placement is deterministic Python.
"""

from __future__ import annotations

import json

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.contracts import (
    CommentSpec,
    EditPlanResponse,
    OrchestratorRequest,
    SupportedCapability,
    ToolOperationStep,
    Verdict,
)
from stirling.contracts.ledger import Discrepancy
from stirling.models import ApiModel, ToolEndpoint
from stirling.models.agent_tool_models import (
    AgentToolId,
    MathAuditorAgentParams,
    PdfCommentAgentParams,
)
from stirling.models.tool_models import AddCommentsParams
from stirling.services import AppRuntime

# Fallback right-margin placement used when a discrepancy has no usable
# anchor text. A4/Letter portrait assumed.
_ICON_X = 520.0
_ICON_Y_TOP = 770.0
_ICON_Y_STRIDE = 28.0
_ICON_SIZE = 20.0

_DEFAULT_AUTHOR = "Stirling Math Auditor"

_LOCALISER_SYSTEM_PROMPT = (
    "You are given a math-audit Verdict (structured JSON) and the user's "
    "original review request. Produce one sticky-note entry per Discrepancy "
    "the user would care about. Each entry carries the discrepancy's index "
    "in the input list, a short subject (a few words), and a body of one or "
    "two sentences. Reply in the SAME LANGUAGE as the user's request. Do "
    "not invent figures; only restate what the Verdict already says. "
    "When a Discrepancy carries `stated` or `expected` values, quote them "
    "verbatim in the comment body — do not paraphrase, abbreviate, or "
    "convert units."
)


class _LocalisedComment(ApiModel):
    discrepancy_index: int = Field(ge=0, description="0-based index of the Discrepancy in verdict.discrepancies.")
    subject: str = Field(min_length=1, max_length=256)
    text: str = Field(min_length=1, max_length=2_000)


class _LocalisedVerdict(ApiModel):
    comments: list[_LocalisedComment] = Field(default_factory=list)


class PdfReviewAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._localiser_agent: Agent[None, _LocalisedVerdict] = Agent(
            model=runtime.fast_model,
            output_type=_LocalisedVerdict,
            system_prompt=_LOCALISER_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._math_intent_classifier = MathIntentClassifier(runtime)

    async def orchestrate(self, request: OrchestratorRequest) -> EditPlanResponse:
        """Entry point for the orchestrator delegate.

        Decides math intent locally via a small classifier LLM (language-agnostic).
        On a math first turn, emits a plan to consult the math auditor; on the
        resume turn, projects the captured :class:`Verdict` into localised
        sticky-note specs. Non-math review prompts route to the composed
        ``pdf-comment-agent`` tool for prose review.
        """
        verdict = extract_math_verdict(request)
        if verdict is not None:
            comments_json = await self._build_localised_comments_payload(request.user_message, verdict)
            return EditPlanResponse(
                summary="",
                steps=[
                    ToolOperationStep(
                        tool=ToolEndpoint.ADD_COMMENTS,
                        parameters=AddCommentsParams(comments=comments_json),
                    )
                ],
            )

        if await self._math_intent_classifier.classify(request.user_message):
            return EditPlanResponse(
                summary="",
                steps=[
                    ToolOperationStep(
                        tool=AgentToolId.MATH_AUDITOR_AGENT,
                        parameters=MathAuditorAgentParams(),
                    )
                ],
                resume_with=SupportedCapability.PDF_REVIEW,
            )

        return EditPlanResponse(
            summary="",
            steps=[
                ToolOperationStep(
                    tool=AgentToolId.PDF_COMMENT_AGENT,
                    parameters=PdfCommentAgentParams(prompt=request.user_message),
                )
            ],
        )

    async def _build_localised_comments_payload(self, user_message: str, verdict: Verdict) -> str:
        """Run the localiser LLM, then combine its output with deterministic
        placement geometry to produce the JSON the ``add-comments`` tool wants.
        """
        prompt = f"User review request:\n{user_message}\n\nMath audit Verdict (JSON):\n{verdict.model_dump_json()}"
        result = await self._localiser_agent.run(prompt)
        specs = self._build_comment_specs(verdict, result.output.comments)
        serialised = [spec.model_dump(by_alias=True, exclude_none=True) for spec in specs]
        return json.dumps(serialised)

    @staticmethod
    def _build_comment_specs(verdict: Verdict, localised: list[_LocalisedComment]) -> list[CommentSpec]:
        """Fuse LLM-localised text with deterministic position geometry.

        Out-of-range ordinals are dropped (defence-in-depth: the LLM's index
        is bounds-checked at validation but we re-check here too).
        """
        specs: list[CommentSpec] = []
        per_page_index: dict[int, int] = {}
        for comment in localised:
            if comment.discrepancy_index >= len(verdict.discrepancies):
                continue
            d = verdict.discrepancies[comment.discrepancy_index]
            stack_index = per_page_index.get(d.page, 0)
            per_page_index[d.page] = stack_index + 1
            y = _ICON_Y_TOP - stack_index * _ICON_Y_STRIDE
            specs.append(
                CommentSpec(
                    page_index=d.page,
                    x=_ICON_X,
                    y=y,
                    width=_ICON_SIZE,
                    height=_ICON_SIZE,
                    text=comment.text,
                    author=_DEFAULT_AUTHOR,
                    subject=comment.subject,
                    anchor_text=_anchor_text_for(d),
                )
            )
        return specs


def _anchor_text_for(d: Discrepancy) -> str | None:
    stated = d.stated.strip()
    if stated:
        return stated
    return d.context.strip() or None
