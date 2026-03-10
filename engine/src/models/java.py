from __future__ import annotations

from .base import ApiModel
from .common import Constraint, DraftSection


class JavaCreateSessionResponse(ApiModel):
    session_id: str


class JavaUpdateSessionRequest(ApiModel):
    outline_text: str | None = None
    outline_filename: str | None = None
    outline_approved: bool | None = None
    outline_constraints: Constraint | None = None
    draft_sections: list[DraftSection] | None = None
    polished_html: str | None = None
    pdf_url: str | None = None
    doc_type: str | None = None
    template_id: str | None = None
    status: str | None = None


class AISession(ApiModel):
    session_id: str | None = None
    user_id: str | None = None
    prompt_latest: str | None = None
    prompt_initial: str | None = None
    doc_type: str | None = None
    template_id: str | None = None
    outline_text: str | None = None
    outline_filename: str | None = None
    outline_approved: bool | None = None
    outline_constraints: Constraint | None = None
    draft_sections: list[DraftSection] | None = None
    polished_html: str | None = None
    pdf_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    status: str | None = None
