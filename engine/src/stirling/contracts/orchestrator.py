from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .agent_drafts import AgentDraftResponse
from .common import (
    ArtifactKind,
    ConversationMessage,
    ExtractedFileText,
    SupportedCapability,
    WorkflowOutcome,
)
from .execution import NextExecutionAction
from .pdf_edit import PdfEditResponse
from .pdf_questions import PdfQuestionResponse


class ExtractedTextArtifact(ApiModel):
    kind: Literal[ArtifactKind.EXTRACTED_TEXT] = ArtifactKind.EXTRACTED_TEXT
    files: list[ExtractedFileText] = Field(default_factory=list)


WorkflowArtifact = Annotated[ExtractedTextArtifact, Field(discriminator="kind")]


class OrchestratorRequest(ApiModel):
    user_message: str
    file_names: list[str]
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    artifacts: list[WorkflowArtifact] = Field(default_factory=list)
    resume_with: SupportedCapability | None = None


class UnsupportedCapabilityResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.UNSUPPORTED_CAPABILITY] = WorkflowOutcome.UNSUPPORTED_CAPABILITY
    capability: str
    message: str


OrchestratorResponse = Annotated[
    PdfEditResponse | PdfQuestionResponse | AgentDraftResponse | NextExecutionAction | UnsupportedCapabilityResponse,
    Field(discriminator="outcome"),
]
