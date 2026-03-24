from __future__ import annotations

from stirling.models.base import ApiModel


class ConversationMessage(ApiModel):
    role: str
    content: str


class PdfTextSelection(ApiModel):
    page_number: int | None = None
    text: str
