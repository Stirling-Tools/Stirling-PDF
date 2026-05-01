"""
Combined-intent precedence — v1 documented limitation.

When a user prompt fires BOTH the math and contradiction intent classifiers
("are the totals AND the conclusions consistent?"), the orchestrator does
NOT fan out into a multi-step plan. Instead, contradiction takes precedence
and the math intent is *silently dropped*. This is the v1 escape hatch
called out in the plan (Section 6, finding C7).

This file pins that behaviour with loud assertions so any future change
that switches the precedence, fans out into both specialists, or otherwise
modifies the dual-intent handling MUST update these tests deliberately.
The intent is to catch drift early — silent regression here would mean
users get half-answered combined prompts with no indication.

When the limitation is lifted (combined classifier returning both flags,
multi-step plan emitting both ``MATH_AUDITOR_AGENT`` and
``CONTRADICTION_AGENT``), delete or rewrite this file rather than relax
the assertions.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.agents.pdf_review import PdfReviewAgent
from stirling.contracts import (
    AiFile,
    EditPlanResponse,
    OrchestratorRequest,
    SupportedCapability,
)
from stirling.models import FileId
from stirling.models.agent_tool_models import AgentToolId
from stirling.services.runtime import AppRuntime


def _ai_file(name: str = "report.pdf") -> AiFile:
    return AiFile(id=FileId(f"{name}-id"), name=name)


# ---------------------------------------------------------------------------
# PdfReviewAgent: dual-intent precedence
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_review_dual_intent_drops_math_silently(runtime: AppRuntime) -> None:
    """When both classifiers return True, the emitted plan contains ONLY
    the contradiction step. The math intent is silently dropped — that is
    the documented v1 limitation. This test pins the drop so any future
    code change that fans out or switches precedence must update it.
    """
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="check the totals AND find contradicting claims",
        files=[_ai_file()],
    )

    contradiction_classify = AsyncMock(return_value=True)
    math_classify = AsyncMock(return_value=True)

    with patch.object(
        agent._contradiction_intent_classifier, "classify", contradiction_classify
    ), patch.object(agent._math_intent_classifier, "classify", math_classify):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)

    # Exactly one step — the contradiction step. NO math step appears.
    assert len(response.steps) == 1, (
        f"v1 precedence regression: expected 1 step (contradiction only), got "
        f"{len(response.steps)} — has the combined-intent limitation been "
        f"lifted? If so, update this test. Steps: "
        f"{[s.tool for s in response.steps]}"
    )
    tools_in_plan = [step.tool for step in response.steps]
    assert AgentToolId.CONTRADICTION_AGENT in tools_in_plan
    assert AgentToolId.MATH_AUDITOR_AGENT not in tools_in_plan, (
        "Math agent appeared in the plan despite v1 precedence rule. "
        "Contradiction-first precedence has been violated."
    )

    assert response.resume_with == SupportedCapability.PDF_REVIEW

    # Contradiction classifier was definitely consulted; math classifier may
    # or may not be (precedence short-circuits). Whichever the implementation
    # chooses, the plan shape above is what matters.
    contradiction_classify.assert_awaited()


@pytest.mark.anyio
async def test_review_dual_intent_no_math_step_in_serialised_plan(
    runtime: AppRuntime,
) -> None:
    """Belt-and-braces: serialise the EditPlanResponse and re-check that
    the math endpoint path does NOT appear anywhere in the JSON. Catches
    the case where math sneaks in as a parameter or auxiliary field.
    """
    agent = PdfReviewAgent(runtime)
    request = OrchestratorRequest(
        user_message="audit the math AND consistency of arguments",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ):
        response = await agent.orchestrate(request)

    serialised = response.model_dump_json()
    assert AgentToolId.MATH_AUDITOR_AGENT.value not in serialised, (
        "Math endpoint path leaked into the serialised plan despite "
        "v1 contradiction-first precedence."
    )
    assert AgentToolId.CONTRADICTION_AGENT.value in serialised


# ---------------------------------------------------------------------------
# PdfQuestionAgent: dual-intent precedence
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_question_dual_intent_drops_math_silently(runtime: AppRuntime) -> None:
    """Same precedence rule applies to PdfQuestionAgent. The first-turn
    plan (now a top-level :class:`EditPlanResponse` to match the math
    branch's shape on main) must contain only the contradiction step.
    """
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="are the numbers and the claims consistent?",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ):
        response = await agent.orchestrate(request)

    assert isinstance(response, EditPlanResponse)

    tools_in_plan = [step.tool for step in response.steps]
    assert AgentToolId.CONTRADICTION_AGENT in tools_in_plan
    assert AgentToolId.MATH_AUDITOR_AGENT not in tools_in_plan, (
        "Math agent appeared in the question-agent plan despite v1 "
        "precedence rule. Contradiction-first precedence has been violated."
    )
    assert response.resume_with == SupportedCapability.PDF_QUESTION


@pytest.mark.anyio
async def test_question_dual_intent_no_math_step_in_serialised_plan(
    runtime: AppRuntime,
) -> None:
    """Same belt-and-braces JSON check on the question-agent path."""
    agent = PdfQuestionAgent(runtime)
    request = OrchestratorRequest(
        user_message="check totals and contradictions",
        files=[_ai_file()],
    )

    with patch.object(
        agent._contradiction_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ), patch.object(
        agent._math_intent_classifier,
        "classify",
        AsyncMock(return_value=True),
    ):
        response = await agent.orchestrate(request)

    serialised = response.model_dump_json()
    assert AgentToolId.MATH_AUDITOR_AGENT.value not in serialised, (
        "Math endpoint path leaked into the serialised question-agent "
        "response despite v1 contradiction-first precedence."
    )
    assert AgentToolId.CONTRADICTION_AGENT.value in serialised
