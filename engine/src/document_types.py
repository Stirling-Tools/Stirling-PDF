from __future__ import annotations

import json
import logging
import os
from functools import cache
from typing import Any

from config import FAST_MODEL
from llm_utils import run_ai
from models import ChatMessage, DocTypeClassification
from prompts import document_type_classification_system_prompt

logger = logging.getLogger(__name__)


@cache
def _load_template_mapping() -> tuple[dict[str, Any], set[str]]:
    """Load template mapping JSON and extract available doctypes."""
    # Get the directory where this file is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    template_mapping_path = os.path.join(current_dir, "template_mapping.json")

    with open(template_mapping_path, encoding="utf-8") as f:
        template_mapping = json.load(f)

    # Extract all doctypes from the mapping
    available_doctypes = {template.get("docType") for template in template_mapping.values() if template.get("docType")}
    logger.info(
        "[DOCTYPE] Loaded template mapping with %d doctypes",
        len(available_doctypes),
    )

    return template_mapping, available_doctypes


# Document types that have format prompts (for AI-based extraction)
SUPPORTED_FORMAT_TYPES = {
    "invoice",
    "resume",
    "cover_letter",
    "contract",
    "nda",
    "meeting_agenda",
    "quote",
    "receipt",
    "expense_report",
    "terms_of_service",
    "privacy_policy",
    "proposal",
    "report",
    "letter",
    "one_pager",
    "statement_of_work",
    "meeting_minutes",
    "press_release",
    "pay_stub",
}


def detect_document_type(
    prompt: str,
    confidence_threshold: float = 0.7,
) -> tuple[str, float]:
    """
    Detect document type using AI classification.

    Args:
        prompt: User's text prompt
        latex_code: Optional LaTeX code to analyze
        confidence_threshold: Minimum confidence (0-1) to accept a match from template list

    Returns:
        Tuple of (doc_type, confidence) where confidence is 0.0-1.0
    """
    ai_type, confidence = _classify_with_ai(prompt, confidence_threshold)
    if ai_type and ai_type != "other" and confidence >= confidence_threshold:
        return ai_type, confidence
    return ai_type or "other", confidence


def _classify_with_ai(prompt: str, confidence_threshold: float = 0.7) -> tuple[str, float]:
    """
    Use a FAST/CHEAP LLM to classify the document type from the user's prompt.

    This uses FAST_MODEL (e.g., gpt-4.1-nano) for quick, cost-effective classification.
    Returns a tuple of (doc_type, confidence) or None if classification fails.
    """
    # Load available doctypes from template mapping
    _, available_doctypes = _load_template_mapping()

    # Build the list of available doctypes for the prompt
    # Include both template mapping doctypes and legacy supported types
    all_doctypes = sorted(list(available_doctypes | SUPPORTED_FORMAT_TYPES))
    doctypes_list = ", ".join(all_doctypes) + ", other"
    system_prompt = document_type_classification_system_prompt(doctypes_list)
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=prompt[:500]),
    ]

    parsed = run_ai(
        FAST_MODEL,
        messages,
        DocTypeClassification,
        tag="doc_type_classify",
        max_tokens=20,
    )
    content = parsed.doc_type.strip().lower()
    content = content.replace("-", "_").replace(" ", "_")
    content = content.split()[0] if content else ""

    logger.info(
        "[DOCTYPE] Fast AI classification model=%s result=%s",
        FAST_MODEL,
        content,
    )
    # Check if the result is in available doctypes (from template mapping)
    if content in available_doctypes:
        # High confidence for template mapping matches
        return content, 0.85
    # Check if it's in legacy supported types
    elif content in SUPPORTED_FORMAT_TYPES:
        # Medium confidence for legacy types
        return content, 0.75
    elif content == "other":
        return "other", 0.5
    else:
        # Unknown type - low confidence
        logger.warning(f"[DOCTYPE] AI returned unknown type '{content}', falling back to 'other'")
        return "other", 0.3


__all__ = [
    "detect_document_type",
    "SUPPORTED_FORMAT_TYPES",
]
