from __future__ import annotations

from typing import Literal

from pydantic import Field

from ..base import ApiModel

ConfirmationAction = Literal["confirm", "cancel", "modify", "new_request", "question"]


class ConfirmationAnswer(ApiModel):
    message: str


class ConfirmationIntent(ApiModel):
    """
    Intent classification during confirmation phase (AWAITING_CONFIRM state).
    CRITICAL: Never ignore user messages during confirmation.
    """

    action: ConfirmationAction = Field(..., description="confirm, cancel, modify, new_request, or question")
    modification_description: str | None = Field(None, description="If action=modify, what change the user wants")
