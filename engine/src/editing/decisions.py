import textwrap
from dataclasses import asdict

from config import FAST_MODEL
from file_processing_agent import ToolCatalogService
from llm_utils import run_ai
from models import AskUserMessage, ChatMessage, DefaultsDecision, IntentDecision
from prompts import (
    edit_defaults_decision_system_prompt,
    edit_info_system_prompt,
    edit_intent_classification_system_prompt,
)


def wants_defaults(message: str, session_id: str | None = None) -> bool:
    system_prompt = edit_defaults_decision_system_prompt()
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=message),
    ]
    decision = run_ai(
        FAST_MODEL,
        messages,
        DefaultsDecision,
        tag="edit_defaults_decision",
        log_label="edit-defaults-decision",
        log_exchange=True,
        session_id=session_id,
    )
    return decision.use_defaults


def classify_edit_intent(
    message: str,
    history: list[ChatMessage],
    *,
    session_id: str | None = None,
) -> IntentDecision | None:
    system_prompt = edit_intent_classification_system_prompt()
    messages = [ChatMessage(role="system", content=system_prompt)]
    messages.extend(history)
    messages.append(ChatMessage(role="user", content=message))
    decision = run_ai(
        FAST_MODEL,
        messages,
        IntentDecision,
        tag="edit_intent_decision",
        log_label="edit-intent-decision",
        log_exchange=True,
        session_id=session_id,
    )
    return decision


def answer_conversational_info(
    message: str,
    history: list[ChatMessage],
    tool_catalog: ToolCatalogService,
    *,
    session_id: str | None = None,
) -> str:
    """Handle conversational queries without files (greetings, help requests, capability questions)."""
    selection_index = tool_catalog.build_selection_index()

    system_instructions = textwrap.dedent("""\
        Answer the user's question about capabilities.
        Be friendly, clear, and helpful.

        This system can:
        1. Edit PDF files - compress, merge, split, rotate, watermark, OCR, convert, add security, and many more operations
        2. Create new PDF documents - generate professional documents from descriptions (business proposals, reports, resumes, etc.)
        3. Create smart folders - set up automated PDF processing workflows that run on uploaded files

        If the user is greeting you (hello, hi, hey), respond warmly and briefly explain what you can help with.
        If asking about capabilities (what can you do, help), provide a clear overview of all three main features.
        For PDF editing questions, reference the available tools from the tool_catalog below.
        Use bullets when listing multiple options.
        Keep responses concise but informative.
        Encourage them to upload a PDF to edit it, or ask to create a new document.
        Do not mention session IDs, technical details, or backend concepts.
    """).strip()

    system_payload = {
        "instructions": system_instructions,
        "tool_catalog": [asdict(entry) for entry in selection_index],
    }

    messages = [
        ChatMessage(role="system", content=[system_payload]),
        *history,
        ChatMessage(role="user", content=message),
    ]
    response = run_ai(
        FAST_MODEL,
        messages,
        AskUserMessage,
        tag="conversational_info_response",
        log_label="conversational-info-response",
        log_exchange=True,
        session_id=session_id,
    )
    return response.message


def answer_edit_info(
    message: str,
    history: list[ChatMessage],
    file_name: str,
    file_type: str | None,
    tool_catalog: ToolCatalogService,
    *,
    session_id: str | None = None,
) -> str:
    catalog_text = tool_catalog.build_catalog_prompt()
    system_prompt = edit_info_system_prompt(file_name, file_type, catalog_text)
    messages = [ChatMessage(role="system", content=system_prompt)]
    messages.extend(history)
    messages.append(ChatMessage(role="user", content=message))
    response = run_ai(
        FAST_MODEL,
        messages,
        AskUserMessage,
        tag="edit_info_response",
        log_label="edit-info-response",
        log_exchange=True,
        session_id=session_id,
    )
    if response and response.message.strip():
        return response.message.strip()
    raise RuntimeError("AI edit info response failed.")
