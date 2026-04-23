from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from stirling.models import ApiModel


class RedactionStrategy(StrEnum):
    LITERAL = "literal"
    REGEX = "regex"
    IMAGE_REDACT = "image_redact"
    LLM_SCAN = "llm_scan"
    MIXED = "mixed"


class PlannerOutput(ApiModel):
    """Classifies the redaction strategy from the user's request alone."""

    strategy: RedactionStrategy
    literal_strings: list[str] = Field(
        default_factory=list,
        description="Exact strings to redact (LITERAL strategy).",
    )
    regex_patterns: list[str] = Field(
        default_factory=list,
        description="Java-compatible regex patterns to find and redact (REGEX strategy).",
    )
    image_page_numbers: list[int] = Field(
        default_factory=list,
        description=("1-based page numbers to scan for images (IMAGE_REDACT strategy). Empty list means all pages."),
    )
    redact_color: str | None = Field(
        default=None,
        description=(
            "Hex colour for the redaction fill (e.g. '#ff0000' for red, '#000000' for black). "
            "Extract from the user's request when they specify a colour. Null means default (black)."
        ),
    )
    rationale: str


class ImageBoundingBox(ApiModel):
    """Identifies a specific image to redact by its PDF user-space bounding box."""

    page_index: int = Field(description="0-based page index.")
    x1: float = Field(description="Left edge in PDF user-space (origin bottom-left, Y up).")
    y1: float = Field(description="Bottom edge in PDF user-space.")
    x2: float = Field(description="Right edge in PDF user-space.")
    y2: float = Field(description="Top edge in PDF user-space.")


class TextRange(ApiModel):
    """A section to redact, identified by the heading that opens it and the heading that closes it."""

    start_string: str = Field(
        description=(
            "The heading or first line that marks the beginning of the section, copied verbatim "
            "from the document. Everything from this line onward is redacted (inclusive)."
        )
    )
    end_string: str = Field(
        description=(
            "The heading or first line of the section that immediately follows the one being "
            "redacted, copied verbatim. This line marks where redaction stops and is NOT itself "
            "redacted — it is the exclusive upper boundary. "
            "Leave empty if the section runs to the end of the document."
        ),
        default="",
    )


class AnalyserOutput(ApiModel):
    """Identifies specific content to redact from extracted document text."""

    strings_to_redact: list[str] = Field(
        default_factory=list,
        description=(
            "Individual values to redact: names, numbers, emails, dates, IDs, addresses, "
            "and any single-line phrases. Copy each exactly as it appears in the document."
        ),
    )
    sections_to_redact: list[TextRange] = Field(
        default_factory=list,
        description=(
            "Named sections (exercises, questions, chapters, appendices, clauses) that span "
            "multiple lines or paragraphs. One entry per section. Provide start_string (the "
            "section heading) and end_string (the heading of the next section — exclusive boundary)."
        ),
    )
    pages_to_redact: list[int] = Field(
        default_factory=list,
        description="0-indexed page numbers for whole-page blackout (structural sections only).",
    )
    images_to_redact: list[ImageBoundingBox] = Field(
        default_factory=list,
        description=(
            "Images to redact identified by their bounding boxes. "
            "Copy the bounds exactly from the '--- Images on this page ---' section of the document content. "
            "Only populate when the user explicitly targets images by spatial position or asks to 'redact all images'."
        ),
    )
    summary: str = Field(description="1-2 sentence summary for the end user.")
    redact_color: str | None = Field(
        default=None,
        description=(
            "Hex colour for the redaction fill (e.g. '#ff0000' for red, '#000000' for black). "
            "Extract from the user's request when they specify a colour. Null means default (black)."
        ),
    )
