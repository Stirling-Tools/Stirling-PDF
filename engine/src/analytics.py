"""
PostHog analytics tracking for Stirling PDF AI document generation.

Tracks LLM usage, costs, latency, and document generation metrics for client insights.
"""

from __future__ import annotations

import logging
from typing import Any

from config import (
    FAST_MODEL,
    FAST_MODEL_REASONING_EFFORT,
    FAST_MODEL_TEXT_VERBOSITY,
    POSTHOG_CLIENT,
    SMART_MODEL,
    SMART_MODEL_REASONING_EFFORT,
    SMART_MODEL_TEXT_VERBOSITY,
)

logger = logging.getLogger(__name__)


def track_event(
    user_id: str | None,
    event_name: str,
    properties: dict[str, Any] | None = None,
    include_model_settings: bool = False,
) -> None:
    """
    Track a generic event to PostHog.

    Args:
        user_id: User identifier (can be anonymous ID or user email)
        event_name: Name of the event (e.g., "document_generated")
        properties: Additional event properties
        include_model_settings: Include GPT-5 reasoning/verbosity settings in properties
    """
    if not user_id:
        return

    try:
        event_props = properties or {}

        # Add model configuration settings for performance tracking
        if include_model_settings:
            event_props.update(
                {
                    "smart_model": SMART_MODEL,
                    "fast_model": FAST_MODEL,
                    "smart_reasoning_effort": SMART_MODEL_REASONING_EFFORT,
                    "smart_text_verbosity": SMART_MODEL_TEXT_VERBOSITY,
                    "fast_reasoning_effort": FAST_MODEL_REASONING_EFFORT,
                    "fast_text_verbosity": FAST_MODEL_TEXT_VERBOSITY,
                }
            )

        POSTHOG_CLIENT.capture(
            distinct_id=user_id,
            event=event_name,
            properties=event_props,
        )
    except Exception as exc:
        logger.warning("Failed to track PostHog event %s: %s", event_name, exc)


def track_session_created(
    user_id: str | None,
    session_id: str,
    doc_type: str,
    template_id: str | None = None,
    has_template: bool = False,
) -> None:
    """
    Track when a new AI document generation session is created.

    Args:
        user_id: User identifier
        session_id: Session ID
        doc_type: Document type
        template_id: Template ID if using a template
        has_template: Whether user provided a custom template
    """
    properties = {
        "session_id": session_id,
        "doc_type": doc_type,
        "has_template": has_template,
    }
    if template_id:
        properties["template_id"] = template_id

    # Include model settings to track performance across different configurations
    track_event(user_id, "session_created", properties, include_model_settings=True)


def shutdown() -> None:
    """Gracefully shutdown PostHog client and flush pending events."""
    try:
        POSTHOG_CLIENT.shutdown()
        logger.info("PostHog client shutdown completed")
    except Exception as exc:
        logger.warning("Error during PostHog shutdown: %s", exc)
