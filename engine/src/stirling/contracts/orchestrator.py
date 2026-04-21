from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .agent_drafts import AgentDraftResponse
from .execution import NextExecutionAction
from .form_fill import KnowledgeUpdateResponse
from .pdf_edit import PdfEditResponse
from .pdf_questions import PdfQuestionResponse


class SupportedCapability(StrEnum):
    ORCHESTRATE = "orchestrate"
    PDF_EDIT = "pdf_edit"
    PDF_QUESTION = "pdf_question"
    AGENT_DRAFT = "agent_draft"
    AGENT_REVISE = "agent_revise"
    AGENT_NEXT_ACTION = "agent_next_action"
    FORM_FILL = "form_fill"


class OrchestratorRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None


class UnsupportedCapabilityResponse(ApiModel):
    outcome: Literal["unsupported_capability"] = "unsupported_capability"
    capability: str
    message: str


OrchestratorResponse = Annotated[
    PdfEditResponse
    | PdfQuestionResponse
    | KnowledgeUpdateResponse
    | AgentDraftResponse
    | NextExecutionAction
    | UnsupportedCapabilityResponse,
    Field(discriminator="outcome"),
]
