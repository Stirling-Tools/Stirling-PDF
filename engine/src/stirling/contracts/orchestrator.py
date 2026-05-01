from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field

from stirling.models import ApiModel, ToolEndpoint

from .agent_drafts import AgentDraftResponse
from .common import (
    AiFile,
    ArtifactKind,
    ConversationMessage,
    ExtractedFileText,
    NeedContentResponse,
    NeedIngestResponse,
    SupportedCapability,
    ToolReportArtifact,
    WorkflowOutcome,
    drop_unknown_tool_endpoints,
)
from .execution import NextExecutionAction
from .pdf_edit import PdfEditTerminalResponse
from .pdf_questions import PdfQuestionTerminalResponse


class ExtractedTextArtifact(ApiModel):
    kind: Literal[ArtifactKind.EXTRACTED_TEXT] = ArtifactKind.EXTRACTED_TEXT
    files: list[ExtractedFileText] = Field(default_factory=list)


WorkflowArtifact = Annotated[ExtractedTextArtifact | ToolReportArtifact, Field(discriminator="kind")]


class OrchestratorRequest(ApiModel):
    user_message: str
    files: list[AiFile] = Field(default_factory=list)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    artifacts: list[WorkflowArtifact] = Field(default_factory=list)
    resume_with: SupportedCapability | None = None
    # See `PdfEditRequest.enabled_endpoints`.
    enabled_endpoints: Annotated[list[ToolEndpoint], BeforeValidator(drop_unknown_tool_endpoints)] = Field(
        default_factory=list
    )


class UnsupportedCapabilityResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.UNSUPPORTED_CAPABILITY] = WorkflowOutcome.UNSUPPORTED_CAPABILITY
    capability: str
    message: str


type OrchestratorResponse = Annotated[
    PdfEditTerminalResponse
    | PdfQuestionTerminalResponse
    | NeedContentResponse
    | NeedIngestResponse
    | AgentDraftResponse
    | NextExecutionAction
    | UnsupportedCapabilityResponse,
    Field(discriminator="outcome"),
]
