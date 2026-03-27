from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from stirling.models import ApiModel

from .agent_drafts import AgentDraftResponse
from .common import PdfTextSelection, SupportedCapability
from .execution import NextExecutionAction
from .pdf_edit import PdfEditResponse
from .pdf_questions import PdfQuestionResponse


class ExtractedTextArtifact(ApiModel):
    kind: Literal["extracted_text"] = "extracted_text"
    pages: list[PdfTextSelection] = Field(default_factory=list)


WorkflowArtifact = Annotated[ExtractedTextArtifact, Field(discriminator="kind")]


class OrchestratorRequest(ApiModel):
    user_message: str
    conversation_id: str | None = None
    file_name: str | None = None
    artifacts: list[WorkflowArtifact] = Field(default_factory=list)
    resume_with: SupportedCapability | None = None


class UnsupportedCapabilityResponse(ApiModel):
    outcome: Literal["unsupported_capability"] = "unsupported_capability"
    capability: str
    message: str


OrchestratorResponse = Annotated[
    PdfEditResponse | PdfQuestionResponse | AgentDraftResponse | NextExecutionAction | UnsupportedCapabilityResponse,
    Field(discriminator="outcome"),
]
