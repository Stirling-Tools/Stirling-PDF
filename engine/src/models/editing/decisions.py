from __future__ import annotations

from typing import Literal

from ..base import ApiModel


class DefaultsDecision(ApiModel):
    use_defaults: bool


class AskUserMessage(ApiModel):
    message: str


class IntentDecision(ApiModel):
    mode: Literal["command", "info", "document_question", "ambiguous"]
    requires_file_context: bool = False
