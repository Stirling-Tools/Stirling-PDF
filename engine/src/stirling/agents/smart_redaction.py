"""
Smart Redaction Workflow — turns a natural-language redaction request into
tool calls for the existing Java redaction endpoints.

Strategy routing:
  LITERAL  → /api/v1/security/auto-redact (exact strings, no regex)
  REGEX    → /api/v1/security/auto-redact (regex patterns, use_regex=True)
  LLM_SCAN → NEED_CONTENT first, then Analyser → auto-redact + optional page redact
  MIXED    → NEED_CONTENT first, Analyser handles everything
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from stirling.contracts import (
    EditCannotDoResponse,
    EditPlanResponse,
    NeedContentFileRequest,
    NeedContentResponse,
    PdfContentType,
    SupportedCapability,
    ToolOperationStep,
)
from stirling.models import ToolEndpoint
from stirling.models.tool_models import ExecuteParams, Strategy
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal models
# ---------------------------------------------------------------------------


class PlannerOutput(BaseModel):
    """Classifies the redaction strategy from the user's request alone."""

    strategy: str = Field(description="One of: literal, regex, image_redact, llm_scan, mixed")
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


class ImageBoundingBox(BaseModel):
    """Identifies a specific image to redact by its PDF user-space bounding box."""

    page_index: int = Field(description="0-based page index.")
    x1: float = Field(description="Left edge in PDF user-space (origin bottom-left, Y up).")
    y1: float = Field(description="Bottom edge in PDF user-space.")
    x2: float = Field(description="Right edge in PDF user-space.")
    y2: float = Field(description="Top edge in PDF user-space.")


class TextRange(BaseModel):
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


class AnalyserOutput(BaseModel):
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


# ---------------------------------------------------------------------------
# SmartRedactionWorkflow
# ---------------------------------------------------------------------------

_PLANNER_PROMPT = """\
Classify a PDF redaction request into a strategy.

LITERAL — user names exact strings to remove.
  Examples: "redact John Smith", "remove the word confidential"
  → strategy="literal", populate literal_strings.

REGEX — user describes a structured data type that can be matched by pattern.
  Examples: "redact all phone numbers", "remove email addresses", "redact NI numbers",
            "redact all dates", "remove credit card numbers", "redact postcodes"
  → strategy="regex", populate regex_patterns with Java-compatible regex strings you write.
  Write precise, well-anchored patterns. Examples:
    UK phone:   (?:(?:\\+44\\s?|0)(?:\\d{2,4}[\\s\\-]?\\d{3,4}[\\s\\-]?\\d{3,4}))
    Email:      [a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}
    UK postcode: [A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}
    ISO date:   \\b\\d{4}-\\d{2}-\\d{2}\\b

IMAGE_REDACT — user wants to redact ALL images, with an optional page restriction but no spatial
  filtering or exclusion.
  Examples: "redact the images", "redact all images", "remove all images", "hide images",
            "redact the images in this PDF", "redact all images on page 2",
            "remove all images on pages 1 and 3"
  → strategy="image_redact". No document scan needed — Java detects image positions directly.
  Populate image_page_numbers (1-based) when the user restricts to specific pages.
  Do NOT use this when the user:
    • describes a specific image by location ("top-left image", "the logo in the header")
    • wants to exclude specific images ("all images except the logo")
    • targets a single image on a page that may have many images

LLM_SCAN — semantic or contextual content requiring a document scan.
  Examples: "redact all PII", "redact names", "redact exercise 2", "redact the appendix",
            "redact the logo in the top left", "redact the image in the top-right corner",
            "redact all images except the logo", "redact all images apart from the one in the footer",
            "redact the image on page 1" (when targeting a specific image by page, not all images)
  → strategy="llm_scan". No strings or patterns needed here.

MIXED — combines regex patterns/literals AND semantic content.
  → strategy="mixed". Populate literal_strings/regex_patterns AND note semantic intent in rationale.

Rules:
- When in doubt between REGEX and LLM_SCAN, choose LLM_SCAN.
- Always include a plain-English rationale.
- If the user specifies a colour for the redaction fill (e.g. "red box", "black out", "white rectangle"),
  set redact_color to the corresponding hex value (e.g. '#ff0000' for red, '#ffffff' for white).
  Leave redact_color null if no colour is mentioned.
"""

_ANALYSER_PROMPT = """\
You are a document analyst for PDF redaction. Given extracted document text and a redaction \
request, identify every instance of content that should be redacted.

strings_to_redact — individual values and single-line phrases:
  • Names, numbers, emails, dates, IDs, addresses, single-line codes/commands.
  • Copy each exact string verbatim, one per entry.
  • Example: ["John Smith", "07700 900123", "john@example.com"]
  • Do NOT use this for multi-line sections (use sections_to_redact instead).
  • Do NOT use this for mathematical expressions or equations (see images_to_redact below).

sections_to_redact — named sections spanning multiple lines or paragraphs:
  • Exercises, questions, chapters, appendices, clauses, tasks, sub-sections, etc.
  • Always emit ONE TextRange PER contiguous block of content to redact — never consolidate
    non-contiguous blocks into one range.
    For "sections 10–14", emit five TextRange entries (one per section), not one for the range.
  • start_string: the heading or first line of the block to redact, copied verbatim. Everything
    from this line onward is redacted, inclusive. Keep to 1–6 words.
  • end_string: the first line of the content that immediately follows the block being redacted,
    copied verbatim. This line is NOT redacted — it is the exclusive boundary where redaction stops.
    CRITICAL: omitting end_string (leaving it "") causes everything from that heading to the
    end of the document to be redacted — only leave it empty if the block genuinely runs to
    the very last line of the document. Keep to 1–6 words.
  • You may emit any number of ranges. Non-contiguous blocks that should be redacted must each
    be their own TextRange — gaps between ranges are left visible.
  • If a heading appears letter-spaced (e.g. "T a b l e  o f  c o n t e n t s"), copy it
    EXACTLY as shown — the search engine normalises it automatically.
  • NEVER put sections in pages_to_redact or strings_to_redact.

pages_to_redact — use ONLY for explicit page-level requests:
  • "Redact page 2", "blackout page 3", "remove all of page 5"
  • The user must be asking to wipe a whole page, not a section on a page.
  • Values are 0-indexed (page 1 = 0, page 2 = 1, etc.).

images_to_redact — image-specific requests AND mathematical content:
  • Spatial targeting: "redact the image in the top left", "redact the logo in the header"
      Each page has an "--- Images on this page ---" block listing images with spatial labels:
        Image N: position=<label>, size=<WxH> pts, bounds=(x1=..., y1=..., x2=..., y2=...)
      Position labels use: top/middle/bottom + left/center/right (e.g. "top-left", "bottom-center").
      Match the user's description to the closest spatial label. Copy x1, y1, x2, y2 exactly.
      page_index is 0-based.
  • Mathematical content: equations, formulas, and mathematical expressions are typeset as
    precisely-positioned glyphs by the PDF engine. Do NOT attempt to redact them via
    strings_to_redact (this produces scattered single-character black boxes). Instead:
      - If the equation appears as an image in the "--- Images on this page ---" block,
        use images_to_redact with its bounding box.
      - If the equation is part of a section, use sections_to_redact to redact the whole
        block containing it.
      - If you cannot determine a safe bounding box, state this in your summary and set
        sections_to_redact to cover the paragraph containing the equation.
  • Exclusion: "redact all images except the logo in the bottom right"
      List ALL images EXCEPT the ones matching the exclusion. The excluded image stays visible.
  • Only populate when the user explicitly targets images by location or with exclusion,
    or when redacting mathematical/typeset content that cannot be matched as plain text.

Rules:
- Only include content you can directly observe in the provided text.
- Do not redact headings or labels if the user only wants values redacted.
- For named sections, always use sections_to_redact (list of headings) — never strings_to_redact or pages_to_redact.
- For image exclusion: include ALL images that are NOT excluded, across all pages.
- NEVER use strings_to_redact for equations or math symbols — use images_to_redact or sections_to_redact.
- Write a concise summary (1-2 sentences) of what will be redacted. If nothing could be identified,
  explain why — e.g. the requested property (font size, colour, position) is not present in plain
  text extraction, or the content described does not appear in the document.
- If the user specifies a colour for the redaction fill (e.g. "red box", "white out"), set
  redact_color to the corresponding hex value (e.g. '#ff0000' for red). Leave null if unspecified.
"""


class SmartRedactionWorkflow:
    """Encapsulates the two-stage planner/analyser pipeline."""

    def __init__(self, runtime: AppRuntime) -> None:
        self._planner = Agent(
            model=runtime.fast_model,
            output_type=PlannerOutput,
            system_prompt=_PLANNER_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        self._analyser = Agent(
            model=runtime.fast_model,
            output_type=AnalyserOutput,
            system_prompt=_ANALYSER_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def plan(self, user_message: str) -> PlannerOutput:
        result = await self._planner.run(f"Redaction request: {user_message}")
        logger.info(
            "[smart-redaction] planner strategy=%s literal=%d patterns=%d",
            result.output.strategy,
            len(result.output.literal_strings),
            len(result.output.regex_patterns),
        )
        return result.output

    async def analyse(self, user_message: str, text_content: str, max_retries: int = 2) -> AnalyserOutput:
        prompt = f"Redaction request: {user_message}\n\nDocument content:\n{text_content}"
        output = AnalyserOutput(summary="")
        for attempt in range(max_retries + 1):
            result = await self._analyser.run(prompt)
            output = result.output
            if (
                output.strings_to_redact
                or output.sections_to_redact
                or output.pages_to_redact
                or output.images_to_redact
            ):
                break
            if attempt < max_retries:
                logger.warning(
                    "[smart-redaction] analyser returned empty output, retrying (attempt %d/%d)",
                    attempt + 1,
                    max_retries,
                )
        logger.info(
            "[smart-redaction] analyser strings=%d sections=%d pages=%d images=%d",
            len(output.strings_to_redact),
            len(output.sections_to_redact),
            len(output.pages_to_redact),
            len(output.images_to_redact),
        )
        return output

    def build_immediate_plan(self, planner_output: PlannerOutput, user_message: str) -> EditPlanResponse | None:
        """Build an EditPlanResponse for LITERAL/REGEX/IMAGE_REDACT (no document scan needed)."""
        # IMAGE_REDACT: Java detects and redacts images directly — no analyser needed.
        if planner_output.strategy == "image_redact":
            page_nums = planner_output.image_page_numbers or []
            image_pages_str = ",".join(str(p) for p in page_nums) if page_nums else None
            return EditPlanResponse(
                summary=user_message,
                rationale=planner_output.rationale,
                steps=[
                    ToolOperationStep(
                        tool=ToolEndpoint.EXECUTE,
                        parameters=ExecuteParams(  # type: ignore[call-arg]
                            redact_all_images=True,
                            image_pages=image_pages_str,
                            strategy=Strategy.auto,
                            redact_color=planner_output.redact_color,
                        ),
                    )
                ],
            )

        texts = planner_output.literal_strings or []
        regex_patterns = planner_output.regex_patterns or []

        if not texts and not regex_patterns:
            return None

        return EditPlanResponse(
            summary=user_message,
            rationale=planner_output.rationale,
            steps=[
                ToolOperationStep(
                    tool=ToolEndpoint.EXECUTE,
                    parameters=ExecuteParams(  # type: ignore[call-arg]
                        texts_to_redact="\n".join(texts) if texts else None,
                        regex_patterns="\n".join(regex_patterns) if regex_patterns else None,
                        strategy=Strategy.auto,
                        redact_color=planner_output.redact_color,
                    ),
                )
            ],
        )

    def build_plan_from_analysis(
        self,
        analyser_output: AnalyserOutput,
        user_message: str,
    ) -> EditPlanResponse | EditCannotDoResponse:
        """Build an EditPlanResponse from Analyser output."""
        strings = analyser_output.strings_to_redact
        sections = analyser_output.sections_to_redact
        pages = analyser_output.pages_to_redact
        images = analyser_output.images_to_redact

        if not strings and not sections and not pages and not images:
            reason = analyser_output.summary or f'No content matching "{user_message}" was found in the document.'
            return EditCannotDoResponse(reason=reason)

        # Convert 0-indexed page numbers to 1-based for the pageNumbers API field.
        page_nums = ",".join(str(p + 1) for p in sorted(pages)) if pages else None

        # Serialize image bounding boxes as "pageIndex,x1,y1,x2,y2" lines.
        image_boxes_str = (
            "\n".join(f"{img.page_index},{img.x1:.1f},{img.y1:.1f},{img.x2:.1f},{img.y2:.1f}" for img in images)
            if images
            else None
        )

        # Flatten sections into interleaved [start, end, start, end, …] pairs.
        # Java's collectRangeBlocks handles cross-column end boundaries automatically via
        # column-overlap detection, so the same text_ranges field works for both single-column
        # and multi-column documents.
        text_ranges = [v for s in sections for v in (s.start_string, s.end_string)] if sections else None

        return EditPlanResponse(
            summary=analyser_output.summary or user_message,
            steps=[
                ToolOperationStep(
                    tool=ToolEndpoint.EXECUTE,
                    parameters=ExecuteParams(  # type: ignore[call-arg]
                        texts_to_redact="\n".join(strings) if strings else None,
                        text_ranges=text_ranges,
                        page_numbers=page_nums,
                        image_boxes=image_boxes_str,
                        strategy=Strategy.auto,
                        redact_color=analyser_output.redact_color,
                    ),
                )
            ],
        )

    @staticmethod
    def need_content_response(file_names: list[str]) -> NeedContentResponse:
        """Build a NEED_CONTENT response requesting full page text for all files."""
        return NeedContentResponse(
            resume_with=SupportedCapability.SMART_REDACTION_AGENT,
            reason="Need document text to identify content for semantic redaction.",
            files=[
                NeedContentFileRequest(
                    file_name=f,
                    content_types=[PdfContentType.PAGE_TEXT],
                )
                for f in file_names
            ],
            max_pages=200,
            max_characters=100_000,
        )
