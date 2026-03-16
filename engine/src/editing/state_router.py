"""
Explicit state machine router for edit flow.
Routes messages based on pending_plan.state: AWAITING_CONFIRM | None (fresh request).
"""

import logging
from dataclasses import dataclass
from typing import Any, Literal

from models import ChatMessage

from .confirmation import answer_confirmation_question, classify_confirmation_intent
from .operations import build_plan_summary
from .session_store import EditSession, PendingPlan

logger = logging.getLogger(__name__)

RoutingAction = Literal[
    "execute",
    "answer_question",
    "route_fresh",
    "error",
    "already_executed",
    "cancelled",
]


@dataclass
class StateRoutingResult:
    """Result of state routing - tells handler what to do next."""

    action: RoutingAction
    plan: PendingPlan | None = None
    message: str | None = None
    error: str | None = None
    followup_intent: Any | None = None
    keep_pending: bool | None = None
    plan_id: str | None = None


def route_message(
    session: EditSession,
    user_message: str,
    history: list[ChatMessage],
) -> StateRoutingResult:
    """
    Route message based on pending_plan state.

    State machine:
        No pending_plan → route as fresh request
        AWAITING_CONFIRM → handle confirmation (confirm/cancel/modify/new_request/question)

    Returns:
        StateRoutingResult with action and context
    """
    if not session.pending_plan:
        return StateRoutingResult(action="route_fresh")

    if session.pending_plan.state == "AWAITING_CONFIRM":
        return _handle_awaiting_confirm(session, user_message, history)

    logger.error(f"[STATE_ROUTER] Unknown state: {session.pending_plan.state}")
    return StateRoutingResult(action="error", error="Invalid pending plan state")


def _handle_awaiting_confirm(
    session: EditSession,
    user_message: str,
    history: list[ChatMessage],
) -> StateRoutingResult:
    """
    Handle message during AWAITING_CONFIRM state.

    CRITICAL: Never ignore messages. Always classify intent.

    Actions:
        - confirm → execute plan
        - cancel → clear plan
        - modify/new_request → clear plan + route as fresh
        - question → answer without executing
    """
    plan = session.pending_plan
    assert plan is not None

    # Build plan summary for context
    operations = [op.operation_id for op in plan.ops]
    plan_summary = build_plan_summary(operations)

    # Classify confirmation intent
    intent = classify_confirmation_intent(
        user_message,
        plan_summary,
        history,
        session_id=session.session_id,
    )

    if not intent:
        # Fallback: treat as question (safe default)
        logger.warning("[STATE_ROUTER] No confirmation intent, defaulting to question")
        intent_action = "question"
    else:
        intent_action = intent.action

    logger.info(
        f"[STATE_ROUTER] confirm_state session_id={session.session_id} intent={intent_action} plan_id={plan.plan_id}"
    )

    if intent_action == "confirm":
        # Check idempotency
        if plan.plan_id in session.executed_plan_ids:
            return StateRoutingResult(
                action="already_executed", plan_id=plan.plan_id, message="This plan has already been executed."
            )

        return StateRoutingResult(
            action="execute",
            plan=plan,
        )

    elif intent_action == "cancel":
        # Clear pending plan
        session.pending_plan = None
        return StateRoutingResult(
            action="cancelled", message="Cancelled. Let me know if you want to do something else."
        )

    elif intent_action in ("modify", "new_request"):
        # Minimal safe behavior: clear + replan
        # Don't try to patch - just treat as fresh request
        logger.info(f"[STATE_ROUTER] {intent_action} detected, clearing plan and routing fresh")
        session.pending_plan = None
        return StateRoutingResult(
            action="route_fresh",
            message=None,  # Don't add extra message, just route
        )

    elif intent_action == "question":
        # Answer question without executing
        answer = answer_confirmation_question(
            user_message,
            plan_summary,
            operations,
            history,
            session_id=session.session_id,
        )
        return StateRoutingResult(
            action="answer_question",
            message=answer,
            keep_pending=True,  # Keep plan for later confirmation
        )

    else:
        logger.warning(f"[STATE_ROUTER] Unknown confirmation intent: {intent_action}")
        return StateRoutingResult(
            action="answer_question",
            message="I didn't understand that. Please confirm to proceed or cancel to stop.",
            keep_pending=True,
        )
