"""
Confirmation intent classification during AWAITING_CONFIRM state.
CRITICAL: Prevents misexecution when user changes mind during confirmation.
"""

from config import FAST_MODEL
from llm_utils import run_ai
from models import ChatMessage, ConfirmationAnswer, ConfirmationIntent
from models.tool_models import OperationId
from prompts import confirmation_intent_system_prompt, confirmation_question_system_prompt


def classify_confirmation_intent(
    message: str,
    pending_plan_summary: str,
    history: list[ChatMessage],
    *,
    session_id: str | None = None,
) -> ConfirmationIntent | None:
    """
    Classify user intent during confirmation phase.
    CRITICAL: This prevents misexecution when user changes mind.

    Returns:
        - confirm: User agrees, execute plan
        - cancel: User cancels, clear plan
        - modify: User wants to change the plan (we'll clear + replan)
        - new_request: User wants something different (clear + route as fresh)
        - question: User asks about the plan (answer without executing)

    Examples:
        "yes" → confirm
        "cancel" → cancel
        "actually delete page 7" → modify
        "never mind, compress it" → new_request
        "what will this do?" → question

    Implementation notes:
        - For "modify": We implement minimal safe behavior (clear + replan)
        - No complex patching needed - just ensure old plan never executes
    """
    system_prompt = confirmation_intent_system_prompt(pending_plan_summary)
    messages = [ChatMessage(role="system", content=system_prompt)]
    messages.extend(history[-3:])  # Last few messages for context
    messages.append(ChatMessage(role="user", content=message))

    decision = run_ai(
        FAST_MODEL,
        messages,
        ConfirmationIntent,
        tag="edit_confirmation_intent",
        log_label="edit-confirmation-intent",
        log_exchange=True,
        session_id=session_id,
    )
    return decision


def answer_confirmation_question(
    question: str,
    plan_summary: str,
    operations: list[OperationId],
    history: list[ChatMessage],
    *,
    session_id: str | None = None,
) -> str:
    """
    Answer user's question about pending plan without executing.

    Args:
        question: User's question
        plan_summary: Summary of pending plan
        operations: Operation objects for details
        history: Conversation history
        session_id: Session ID for logging

    Returns:
        Answer to user's question
    """
    system_prompt = confirmation_question_system_prompt(plan_summary, operations)
    messages = [ChatMessage(role="system", content=system_prompt)]
    messages.extend(history[-3:])
    messages.append(ChatMessage(role="user", content=question))

    response = run_ai(
        FAST_MODEL,
        messages,
        ConfirmationAnswer,
        tag="edit_confirmation_question",
        log_label="edit-confirmation-question",
        log_exchange=True,
        session_id=session_id,
    )
    if response and response.message:
        return response.message.strip()
    raise RuntimeError("AI confirmation question response failed.")
