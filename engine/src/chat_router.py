from __future__ import annotations

from config import FAST_MODEL
from format_prompts import FORMAT_PROMPTS
from llm_utils import run_ai
from models import ChatMessage, ChatRouteRequest, ChatRouteResponse
from prompts import chat_route_system_prompt


def classify_chat_route(request: ChatRouteRequest) -> ChatRouteResponse:
    """
    Classify a chat message to route it to edit vs create workflows.

    Returns ChatRouteResponse.
    """
    # Build list of available document types for detection
    available_types = sorted(list(FORMAT_PROMPTS.keys()))
    types_list = ", ".join(available_types)
    system_prompt = chat_route_system_prompt(types_list)

    messages = [
        ChatMessage(role="system", content=system_prompt),
        *request.history[-6:],
        ChatMessage(
            role="user",
            content=(
                "Context:\n"
                f"- has_files={request.has_files}\n"
                f"- has_editable_html={request.has_editable_html}\n"
                f"- has_create_session={request.has_create_session}\n"
                f"- has_edit_session={request.has_edit_session}\n"
                f"- last_route={request.last_route}\n\n"
                f"- request_title={request.request_title}\n"
                f"- title_context={request.title_context.model_dump() if request.title_context else None}\n\n"
                f"Message: {request.message}"
            ),
        ),
    ]
    result = run_ai(
        FAST_MODEL,
        messages,
        ChatRouteResponse,
        tag="chat_route",
        log_label="chat-route",
        log_exchange=True,
    )
    return result
