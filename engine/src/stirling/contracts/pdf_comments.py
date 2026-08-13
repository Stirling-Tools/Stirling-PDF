"""
PDF Comment Agent — shared models for the Java-Python protocol.

The Java backend extracts positioned text chunks from a PDF and sends them
along with a user prompt to the Python engine. Python selects the chunks
that warrant a comment and returns an instruction list; Java then applies
the actual PDF sticky-note annotations.

Python never touches the PDF bytes. It only sees pre-extracted text with
stable ids and must echo those ids back so Java can resolve each comment
to its anchor.
"""

from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

# Bounds shared between the on-wire contract (enforced by pydantic) and any
# Python-side defence-in-depth validation. Java enforces its own caps before
# sending, but a malicious or buggy direct caller could otherwise ship an
# unbounded payload.
MAX_USER_MESSAGE_LENGTH = 4_000
MAX_CHUNK_TEXT_LENGTH = 1_000
MAX_COMMENT_TEXT_LENGTH = 2_000
MAX_CHUNKS_PER_REQUEST = 2_500  # a hair above Java's 2000 cap — soft ceiling


class TextChunk(ApiModel):
    """One positioned text chunk extracted from a PDF page by Java.

    The ``id`` is the stable handle used to anchor a comment to this chunk;
    Python must echo it back verbatim on any comment that targets this chunk.
    The bounding box is in PDF user-space (origin = bottom-left of the page).
    """

    id: str = Field(
        min_length=1,
        max_length=64,
        description="Stable id, typically 'p{page}-c{chunk}'. Must be echoed unchanged on returned comments.",
    )
    page: int = Field(ge=0, description="0-indexed page number this chunk lives on.")
    x: float = Field(description="PDF user-space x of the chunk's bounding box (bottom-left origin).")
    y: float = Field(description="PDF user-space y of the chunk's bounding box (bottom-left origin).")
    width: float = Field(ge=0, description="Width of the chunk's bounding box, in PDF user-space units.")
    height: float = Field(ge=0, description="Height of the chunk's bounding box, in PDF user-space units.")
    text: str = Field(
        min_length=1,
        max_length=MAX_CHUNK_TEXT_LENGTH,
        description="The extracted text for this chunk. Typically one line.",
    )


class PdfCommentRequest(ApiModel):
    """Request body Java sends to POST /api/v1/ai/pdf-comment-agent/generate.

    Carries the user's natural-language instruction plus the list of text
    chunks Java was able to extract from the PDF.
    """

    session_id: str = Field(
        min_length=1,
        max_length=128,
        description="Opaque handle Java uses to correlate the request with its in-flight PDF job.",
    )
    user_message: str = Field(
        min_length=1,
        max_length=MAX_USER_MESSAGE_LENGTH,
        description="The end-user prompt describing what the AI should comment on.",
    )
    chunks: list[TextChunk] = Field(
        default_factory=list,
        max_length=MAX_CHUNKS_PER_REQUEST,
        description="All positioned text chunks Java extracted from the PDF; may be empty if the PDF has no text.",
    )


class PdfCommentInstruction(ApiModel):
    """One review comment the agent wants Java to apply to the PDF.

    ``chunk_id`` MUST match the id of a chunk that appeared in the request;
    Java uses it to resolve the bounding box and anchor the sticky-note
    annotation. Comments referencing an unknown id are dropped.
    """

    chunk_id: str = Field(
        min_length=1,
        max_length=64,
        description="Id of the input chunk this comment anchors to. Must match an input chunk.id.",
    )
    comment_text: str = Field(
        min_length=1,
        max_length=MAX_COMMENT_TEXT_LENGTH,
        description="The comment body shown in the sticky-note popup. One or two sentences.",
    )
    author: str | None = Field(
        default=None,
        max_length=128,
        description="Optional author label; Java falls back to a default when absent.",
    )
    subject: str | None = Field(
        default=None,
        max_length=256,
        description="Optional short subject/title for the comment popup; Java falls back to a default when absent.",
    )


class PdfCommentResponse(ApiModel):
    """Response body the agent returns for POST /api/v1/ai/pdf-comment-agent/generate.

    ``session_id`` is echoed from the request so Java can match the reply to
    its pending job. ``comments`` is the (possibly filtered) list of review
    instructions Java should apply as PDF Text annotations.
    """

    session_id: str = Field(
        min_length=1,
        max_length=128,
        description="Echoed from the request so Java can match the reply to its pending job.",
    )
    comments: list[PdfCommentInstruction] = Field(
        default_factory=list,
        description="Review comments to apply. Each chunk_id is guaranteed to match an input chunk.",
    )
    rationale: str = Field(
        max_length=1_000,
        description="One-sentence summary describing the agent's overall approach for traceability/logging.",
    )


class PdfCommentReport(ApiModel):
    """Structured report surfaced by the pdf-comment-agent tool alongside the
    annotated PDF body. Mirrors the JSON shape the controller builds in
    ``PdfCommentAgentController.buildReportHeader``.

    Lands as the top-level ``AiWorkflowResponse.report`` on the COMPLETED
    outcome (the pdf-comment-agent flow terminates without ``resume_with``,
    so this never re-enters the orchestrator as a resume artifact).
    """

    annotations_applied: int = Field(
        ge=0, description="Number of sticky-note annotations actually written into the PDF."
    )
    instructions_received: int = Field(
        ge=0, description="Number of comment instructions the engine produced before filtering."
    )
    rationale: str | None = Field(
        default=None, description="One-sentence summary the engine emitted alongside the comments."
    )
