from __future__ import annotations

from collections.abc import Iterable
from enum import StrEnum
from typing import Literal, assert_never

from pydantic import Field, model_validator

from stirling.contracts.ledger import Verdict
from stirling.models import OPERATIONS, ApiModel, FileId, ToolEndpoint
from stirling.models.agent_tool_models import AGENT_OPERATIONS, AgentToolId, AnyParamModel, AnyToolId


class PdfContentType(StrEnum):
    """Types of content that can be extracted from a PDF and sent to the AI.

    Java counterpart: AiPdfContentType.java - values must stay in sync.
    """

    # Document-level structured data
    PAGE_LAYOUT = "page_layout"
    DOCUMENT_METADATA = "document_metadata"
    ENCRYPTION_INFO = "encryption_info"
    BOOKMARKS = "bookmarks"
    LAYERS = "layers"
    EMBEDDED_FILES = "embedded_files"
    JAVASCRIPT = "javascript"
    LINKS = "links"
    IMAGE_INFO = "image_info"
    FONTS = "fonts"

    # Text and content
    PAGE_TEXT = "page_text"
    FULL_TEXT = "full_text"
    FORM_FIELDS = "form_fields"
    ANNOTATIONS = "annotations"
    SIGNATURES = "signatures"
    STRUCTURE_TREE = "structure_tree"
    XMP_METADATA = "xmp_metadata"

    # Heavy content
    COMPLIANCE = "compliance"
    IMAGES = "images"


class WorkflowOutcome(StrEnum):
    """Discriminator values for all workflow response unions (outcome field).

    Java counterpart: AiWorkflowOutcome.java - values must stay in sync.
    """

    ANSWER = "answer"
    NEED_CONTENT = "need_content"
    NEED_INGEST = "need_ingest"
    NOT_FOUND = "not_found"
    PLAN = "plan"
    NEED_CLARIFICATION = "need_clarification"
    CANNOT_DO = "cannot_do"
    DRAFT = "draft"
    TOOL_CALL = "tool_call"
    COMPLETED = "completed"
    CANNOT_CONTINUE = "cannot_continue"
    UNSUPPORTED_CAPABILITY = "unsupported_capability"


class ArtifactKind(StrEnum):
    """Discriminator values for WorkflowArtifact unions (kind field).

    Java counterpart: PdfContentExtractor.ArtifactKind - values must stay in sync.
    """

    EXTRACTED_TEXT = "extracted_text"
    TOOL_REPORT = "tool_report"


class StepKind(StrEnum):
    """Discriminator values for AgentSpecStep unions (kind field)."""

    TOOL = "tool"
    AI_TOOL = "ai_tool"


class SupportedCapability(StrEnum):
    ORCHESTRATE = "orchestrate"
    PDF_EDIT = "pdf_edit"
    PDF_QUESTION = "pdf_question"
    PDF_REVIEW = "pdf_review"
    AGENT_DRAFT = "agent_draft"
    AGENT_REVISE = "agent_revise"
    AGENT_NEXT_ACTION = "agent_next_action"
    MATH_AUDITOR_AGENT = "math_auditor_agent"


class ConversationMessage(ApiModel):
    role: str
    content: str


class AiFile(ApiModel):
    """A file the user has supplied, identified by both a stable id and a display name.

    The id is opaque to the engine: Java generates it (content hash, file path, UUID, etc.)
    and the engine uses it as the RAG collection key for any agent that indexes content.
    The name is used in user-facing prompts and responses.
    """

    id: FileId = Field(min_length=1)
    name: str = Field(min_length=1)


def format_conversation_history(conversation_history: list[ConversationMessage]) -> str:
    if not conversation_history:
        return "None"
    return "\n".join(f"- {message.role}: {message.content}" for message in conversation_history)


def format_file_names(files: list[AiFile]) -> str:
    if not files:
        return "No file names were provided."
    return ", ".join(file.name for file in files)


class PdfTextSelection(ApiModel):
    page_number: int | None = None
    text: str


class ExtractedFileText(ApiModel):
    file_name: str
    pages: list[PdfTextSelection] = Field(default_factory=list)


class NeedContentFileRequest(ApiModel):
    file: AiFile
    page_numbers: list[int] = Field(default_factory=list)
    content_types: list[PdfContentType]


class NeedContentResponse(ApiModel):
    outcome: Literal[WorkflowOutcome.NEED_CONTENT] = WorkflowOutcome.NEED_CONTENT
    resume_with: SupportedCapability
    reason: str
    files: list[NeedContentFileRequest] = Field(default_factory=list)
    max_pages: int
    max_characters: int


class MathAuditorToolReportArtifact(ApiModel):
    """Structured Verdict produced by the math-auditor on a previous orchestrator turn.

    New specialists that the orchestrator needs to digest on a resume turn
    should add a sibling artifact type here and lift this into a discriminated
    union keyed on ``source_tool``.

    Java counterpart: {@code PdfContentExtractor.ToolReportArtifact}.
    """

    kind: Literal[ArtifactKind.TOOL_REPORT] = ArtifactKind.TOOL_REPORT
    source_tool: Literal[AgentToolId.MATH_AUDITOR_AGENT] = AgentToolId.MATH_AUDITOR_AGENT
    report: Verdict


# Type alias kept around so callers don't have to know there's only one variant
# today; lifts into a discriminated union when a second consumer-side report
# appears.
ToolReportArtifact = MathAuditorToolReportArtifact


class NeedIngestResponse(ApiModel):
    """Signal that the listed files must be ingested into RAG before the agent can continue.

    Java's handling: for each file, extract the requested content types, POST to
    ``/api/v1/rag/documents`` keyed by ``file.id``, then retry the original request.
    """

    outcome: Literal[WorkflowOutcome.NEED_INGEST] = WorkflowOutcome.NEED_INGEST
    resume_with: SupportedCapability
    reason: str
    files_to_ingest: list[AiFile]
    content_types: list[PdfContentType] = Field(default_factory=list)


class ToolOperationStep(ApiModel):
    kind: Literal[StepKind.TOOL] = StepKind.TOOL
    tool: AnyToolId
    parameters: AnyParamModel

    @model_validator(mode="after")
    def validate_tool_parameter_pairing(self) -> ToolOperationStep:
        if isinstance(self.tool, AgentToolId):
            expected_type = AGENT_OPERATIONS[self.tool]
        elif isinstance(self.tool, ToolEndpoint):
            expected_type = OPERATIONS[self.tool]
        else:
            assert_never(self.tool)

        if not isinstance(self.parameters, expected_type):
            actual_type = type(self.parameters).__name__
            raise ValueError(f"Parameters for tool {self.tool} must be {expected_type.__name__}, got {actual_type}.")
        return self


def drop_unknown_tool_endpoints(value: Iterable[str | ToolEndpoint]) -> list[ToolEndpoint]:
    """Coerce inbound endpoint identifiers into `ToolEndpoint` members, dropping unknowns.

    Java sends the full set of endpoints it considers enabled. The engine and the Java
    backend may have version drift in either direction, so we silently drop anything we
    don't recognise rather than failing the request. Anything dropped simply doesn't
    appear as a supported tool to the planner.
    """
    return [ToolEndpoint(item) for item in value if item in ToolEndpoint]
