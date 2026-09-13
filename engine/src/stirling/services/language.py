"""Per-request reply language, bound by the orchestrator, read by prompt builders."""

from __future__ import annotations

from contextvars import ContextVar

_locale: ContextVar[str | None] = ContextVar("stirling_reply_locale", default=None)


def set_reply_locale(locale: str | None) -> None:
    _locale.set(locale)


def language_directive() -> str:
    """Prompt line pinning the reply language; append to any user-facing prompt."""
    locale = _locale.get()
    if not locale:
        return "Write anything the user will read in the same language as their message."
    return (
        f"Write anything the user will read in the language of locale '{locale}', whatever "
        "language this prompt, the documents, or the tool output are in. Only a different "
        "language the user explicitly asks for overrides this."
    )
