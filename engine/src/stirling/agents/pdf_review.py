"""PDF review delegate.

Produces an annotated PDF with review comments. Math-flavoured prompts
consult the math-auditor specialist first (via a plan + resume) and then
project the :class:`Verdict` into sticky-note specs for ``add-comments``.
Other review prompts route to the composed ``pdf-comment-agent`` tool,
which does its own chunk extraction + AI round-trip.
"""

from __future__ import annotations

from stirling.agents.math_presentation import (
    extract_math_verdict,
    is_math_intent,
    verdict_to_add_comments_payload,
)
from stirling.contracts import (
    EditPlanResponse,
    OrchestratorRequest,
    SupportedCapability,
    ToolOperationStep,
)
from stirling.models import ToolEndpoint
from stirling.models.agent_tool_models import (
    AgentToolId,
    MathAuditorAgentParams,
    PdfCommentAgentParams,
)
from stirling.models.tool_models import AddCommentsParams
from stirling.services import AppRuntime


class PdfReviewAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def orchestrate(self, request: OrchestratorRequest) -> EditPlanResponse:
        if is_math_intent(request.user_message):
            verdict = extract_math_verdict(request)
            if verdict is None:
                return EditPlanResponse(
                    summary="Consulting the math auditor to flag errors on the PDF...",
                    steps=[
                        ToolOperationStep(
                            tool=AgentToolId.MATH_AUDITOR_AGENT,
                            parameters=MathAuditorAgentParams(),
                        )
                    ],
                    resume_with=SupportedCapability.PDF_REVIEW,
                )
            comments_json = verdict_to_add_comments_payload(verdict)
            discrepancy_count = len(verdict.discrepancies or [])
            suffix = "s" if discrepancy_count != 1 else ""
            return EditPlanResponse(
                summary=f"Flagging {discrepancy_count} math issue{suffix} on the PDF.",
                steps=[
                    ToolOperationStep(
                        tool=ToolEndpoint.ADD_COMMENTS,
                        parameters=AddCommentsParams(comments=comments_json),
                    )
                ],
            )

        return EditPlanResponse(
            summary="Add AI-generated review comments to the PDF.",
            steps=[
                ToolOperationStep(
                    tool=AgentToolId.PDF_COMMENT_AGENT,
                    parameters=PdfCommentAgentParams(prompt=request.user_message),
                )
            ],
        )
