"""PDF review delegate.

Produces an annotated PDF with review comments. The agent classifies the
prompt intent locally and routes:

* **Contradiction** prompts → run :class:`ContradictionDetector` directly
  in this process, localise the findings via a small LLM, and emit a
  single :class:`EditPlanResponse` with paired ``ADD_COMMENTS`` sticky
  notes. This is a single-turn flow — no resume, no Java tool dispatch.
* **Math** prompts → emit a plan that consults the math-auditor
  specialist and re-enter on the resume turn with the structured
  :class:`Verdict` to produce sticky-note specs.
* **Everything else** → route to the composed ``pdf-comment-agent`` tool.

**Intent precedence**: contradiction takes precedence over math. A
combined math+contradiction prompt isn't supported as a fan-out plan in
v1 — the contradiction path runs and the math signal is dropped.

Sticky-note text is produced by a small LLM that reads the structured
verdict/report and the user's original prompt and writes comments in
the SAME LANGUAGE as the prompt. Bounding-box placement is
deterministic Python; verbatim claims anchor by text snippet,
paraphrased claims fall back to margin geometry.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.contradiction import ContradictionDetector, ContradictionIntentClassifier
from stirling.agents.contradiction.detector import _escape_for_tag
from stirling.agents.contradiction.prompts import REVIEW_LOCALISER_PROMPT
from stirling.agents.math_presentation import MathIntentClassifier, extract_math_verdict
from stirling.contracts import (
    AiFile,
    CommentSpec,
    ContradictionReport,
    EditPlanResponse,
    NeedIngestResponse,
    OrchestratorRequest,
    PdfContentType,
    PdfReviewOrchestrateResponse,
    SupportedCapability,
    ToolOperationStep,
    Verdict,
)
from stirling.contracts.ledger import Discrepancy
from stirling.models import ApiModel, PrincipalId, ToolEndpoint
from stirling.models.agent_tool_models import (
    AgentToolId,
    MathAuditorAgentParams,
    PdfCommentAgentParams,
)
from stirling.models.tool_models import AddCommentsParams
from stirling.services import AppRuntime, require_current_user_id

# Fallback right-margin placement used when a finding has no usable
# anchor text. A4/Letter portrait assumed.
_ICON_X = 520.0
_ICON_Y_TOP = 770.0
_ICON_Y_STRIDE = 28.0
_ICON_SIZE = 20.0

_DEFAULT_AUTHOR = "Stirling Math Auditor"
_CONTRADICTION_AUTHOR = "Stirling Contradiction Auditor"

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


class _PairedLocalisedContradiction(ApiModel):
    contradiction_index: int = Field(ge=0)
    which_claim: Literal["claim1", "claim2"] = Field(
        description="Which claim of the pair this sticky note describes; exactly 'claim1' or 'claim2'.",
    )
    subject: str = Field(min_length=1, max_length=256)
    text: str = Field(min_length=1, max_length=2_000)


class _LocalisedContradictionReport(ApiModel):
    comments: list[_PairedLocalisedContradiction] = Field(default_factory=list)


class PdfReviewAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._localiser_agent: Agent[None, _LocalisedVerdict] = Agent(
            model=runtime.fast_model,
            output_type=_LocalisedVerdict,
            system_prompt=_LOCALISER_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._contradiction_localiser: Agent[None, _LocalisedContradictionReport] = Agent(
            model=runtime.fast_model,
            output_type=_LocalisedContradictionReport,
            system_prompt=REVIEW_LOCALISER_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._math_intent_classifier = MathIntentClassifier(runtime)
        self._contradiction_intent_classifier = ContradictionIntentClassifier(runtime)
        # Per consuming-agent instance (which is per-request in the
        # orchestrator); the underlying extractor / canonicaliser /
        # detector / summary Agents and the ChunkedMapper it owns are
        # constructed once for that instance and reused across the
        # request's stages.
        self._contradiction_detector = ContradictionDetector(runtime)

    async def orchestrate(self, request: OrchestratorRequest) -> PdfReviewOrchestrateResponse:
        """Entry point for the orchestrator delegate.

        Resume turn comes first: if a math verdict was attached, project it
        into sticky-note specs and return. Otherwise classify intent locally
        (contradiction wins ties — see module docstring) and route.
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

        # Contradiction takes precedence over math.
        if await self._contradiction_intent_classifier.classify(request.user_message):
            missing = await self._find_missing_files(request.files)
            if missing:
                return NeedIngestResponse(
                    resume_with=SupportedCapability.PDF_REVIEW,
                    reason="Some files have not been ingested yet.",
                    files_to_ingest=missing,
                    content_types=[PdfContentType.PAGE_TEXT],
                )
            report = await self._contradiction_detector.detect(
                request.files,
                principals=[PrincipalId(require_current_user_id())],
                query=request.user_message,
            )
            comments_json = await self._build_contradiction_comments_payload(request.user_message, report)
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

    async def _find_missing_files(self, files: list[AiFile]) -> list[AiFile]:
        principals = [PrincipalId(require_current_user_id())]
        missing: list[AiFile] = []
        for file in files:
            if not await self.runtime.documents.has_collection(file.id, principals=principals):
                missing.append(file)
        return missing

    async def _build_localised_comments_payload(self, user_message: str, verdict: Verdict) -> str:
        """Run the math localiser LLM, then combine its output with deterministic
        placement geometry to produce the JSON the ``add-comments`` tool wants.
        """
        prompt = f"User review request:\n{user_message}\n\nMath audit Verdict (JSON):\n{verdict.model_dump_json()}"
        result = await self._localiser_agent.run(prompt)
        specs = self._build_comment_specs(verdict, result.output.comments)
        serialised = [spec.model_dump(by_alias=True, exclude_none=True) for spec in specs]
        return json.dumps(serialised)

    async def _build_contradiction_comments_payload(
        self,
        user_message: str,
        report: ContradictionReport,
    ) -> str:
        """Build paired ADD_COMMENTS JSON from a contradiction report.

        Each contradiction produces two sticky notes (one on each claim's
        page) that cross-reference each other. Anchor placement is driven
        by ``Claim.anchor_quality``: ``verbatim`` quotes locate by text
        search, ``paraphrased`` quotes fall back to margin geometry.

        Returns the JSON payload as a *string* because ``AddCommentsParams``
        types its ``comments`` field as ``str`` — that field is auto-
        generated from the Java OpenAPI spec at ``models/tool_models.py``
        and matches the Java DTO it crosses the wire to. The string IS
        the contract; we can't return a ``list[CommentSpec]`` without
        coordinated changes on the Java side. The math localiser
        (``_build_localised_comments_payload`` above) returns the same
        shape for the same reason.
        """
        prompt = (
            f"<user_message>{_escape_for_tag(user_message)}</user_message>\n"
            f"<verdict>{_escape_for_tag(report.model_dump_json())}</verdict>"
        )
        result = await self._contradiction_localiser.run(prompt)
        specs = self._build_paired_comment_specs(report, result.output.comments)
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

    @staticmethod
    def _build_paired_comment_specs(
        report: ContradictionReport,
        localised: list[_PairedLocalisedContradiction],
    ) -> list[CommentSpec]:
        """Convert paired localised entries into ``CommentSpec`` objects.

        Two specs per contradiction (one per claim). Verbatim claims use
        ``anchor_text``; paraphrased claims rely on deterministic margin
        geometry. Out-of-range ordinals are dropped.
        """
        specs: list[CommentSpec] = []
        per_page_index: dict[int, int] = {}
        for entry in localised:
            if entry.contradiction_index >= len(report.contradictions):
                continue
            contradiction = report.contradictions[entry.contradiction_index]
            # ``which_claim`` is a Literal["claim1", "claim2"] on the schema,
            # so pydantic has already rejected anything else.
            claim = contradiction.claim1 if entry.which_claim == "claim1" else contradiction.claim2

            # Convert 1-indexed page (contracts use 1-indexed) to the
            # 0-indexed page_index that the ADD_COMMENTS tool expects.
            page_index = max(claim.page - 1, 0)
            stack_index = per_page_index.get(page_index, 0)
            per_page_index[page_index] = stack_index + 1
            y = _ICON_Y_TOP - stack_index * _ICON_Y_STRIDE
            anchor_text = claim.quote if claim.anchor_quality == "verbatim" else None
            specs.append(
                CommentSpec(
                    page_index=page_index,
                    x=_ICON_X,
                    y=y,
                    width=_ICON_SIZE,
                    height=_ICON_SIZE,
                    text=entry.text,
                    author=_CONTRADICTION_AUTHOR,
                    subject=entry.subject,
                    anchor_text=anchor_text,
                )
            )
        return specs


def _anchor_text_for(d: Discrepancy) -> str | None:
    stated = d.stated.strip()
    if stated:
        return stated
    return d.context.strip() or None


__all__ = ["PdfReviewAgent"]
