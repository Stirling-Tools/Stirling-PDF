"""PDF to Markdown Agent.

Converts a parsed PDF document into a single clean Markdown document, preserving
headings, paragraphs, and tables in reading order.
"""

from __future__ import annotations

import logging
import re
import time

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    format_conversation_history,
)
from stirling.contracts.pdf_to_markdown import (
    PageLayout,
    PdfToMarkdownCannotDoResponse,
    PdfToMarkdownRequest,
    PdfToMarkdownResponse,
    PdfToMarkdownSuccessResponse,
)
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


# Warn when output tokens are close to the typical model output limit (~8192 for most
# configurations). The actual limit is model-specific; this threshold catches likely truncation.
_OUTPUT_TOKEN_TRUNCATION_THRESHOLD = 7500

# ── LLM output model ────────────────────────────────────────────────────────────────────────────


class _ReconstructionOutput(BaseModel):
    markdown: str = Field(description="Full document reconstructed as clean Markdown.")


# ── Agent ────────────────────────────────────────────────────────────────────────────────────────


class PdfToMarkdownAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._reconstruct_agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(_ReconstructionOutput),
            system_prompt=(
                "You reconstruct PDF pages into clean Markdown from spatial fragment data.\n"
                "Input: PAGE LAYOUT — per-fragment x/y/font data for structural analysis.\n\n"
                "COLUMN DETECTION (for tables in page_layout):\n"
                "- Look at the x-positions of fragments across 3+ consecutive lines.\n"
                "- If fragments cluster at the same x-positions across multiple lines, those are table columns.\n"
                "- Each distinct x-cluster is one column."
                " Name them from the header row (the first line in the cluster).\n"
                "- Do NOT merge values from different x-columns into one cell.\n\n"
                "ROW DETECTION:\n"
                "- Each unique y-coordinate (or group within 3pt) is one table row.\n"
                "- Every line of layout data is its own row — do not merge rows.\n"
                "- If a column has no fragment on a given y-row, that cell is empty.\n\n"
                "TABLE RENDERING:\n"
                "- Render as: | col1 | col2 | col3 |\n"
                "             | --- | --- | --- |\n"
                "             | val | val | val |\n"
                "- One source row = one table row. Never collapse multiple rows into one.\n"
                "- Preserve numeric values exactly (no rounding, no formatting changes).\n"
                "- Bold cells: wrap with ** in the Markdown cell.\n"
                "- CRITICAL: the separator row `| --- | --- |` appears EXACTLY ONCE per table, immediately\n"
                "  after the header row. NEVER put `| --- |` after a data row or between data rows.\n"
                "  NEVER put a blank line inside a table. All rows (header + data) must be consecutive.\n"
                "- Do NOT produce a header-only table followed by a second table with the data rows.\n"
                "  One logical table = one markdown table block, with header, one separator, then all data.\n\n"
                "GROUP HEADERS (label-only rows inside a table):\n"
                "- A row is a group header when: the first column has text AND every numeric column is empty.\n"
                "- Do NOT render group headers as table rows with empty cells.\n"
                "- Break the table, emit the label as **bold text** on its own line,"
                " then start a new table for the rows that follow.\n"
                "- Example labels: 'Policy functions', 'Non-current assets'.\n\n"
                "TOTAL AND SUBTOTAL ROWS:\n"
                "- Detect rows whose first cell contains (case-insensitive):"
                " total, subtotal, surplus, balance, net, sum.\n"
                "- These rows have numeric content — they are NOT group headers.\n"
                "- Render the entire row in bold: | **Total income** | **1,234** | **5,678** |\n"
                "- Keep total rows attached to the group they summarise.\n\n"
                "MULTI-LEVEL TABLES (year or period as a row label):\n"
                "- Detect when a row contains only a single label (a year like '2010' or period like 'Q1 2023')"
                " with no numeric content, followed by repeated metric rows.\n"
                "- Do NOT render the year as a table row.\n"
                "- Normalise: add 'Year' as the first column, 'Metric' as the second,"
                " and repeat the year value on each metric row.\n\n"
                "PROSE REGIONS:\n"
                "- Lines where x-positions vary across lines (not repeating columns) are prose.\n"
                "- Merge lines at the same x-level into paragraphs. Separate indented lines.\n\n"
                "HEADINGS:\n"
                "- A line is a heading when it is bold OR font_size ≥2pt above body.\n"
                "  CRITICAL EXCEPTION: a bold fragment is a TABLE HEADER CELL, not a document heading, when\n"
                "  the same y-row in page_layout contains other fragments at different x-positions.\n"
                "  Only classify a bold line as a document heading when it is the SOLE fragment on its y-row.\n"
                "  Example: 'Non-current assets' at y=120 with '2010'@x=350, '2009'@x=420, '2008'@x=490\n"
                "  → this is a table header row, NOT a heading. Render it as the first cell of the table.\n"
                "- Use ## for section headings, ### for sub-headings. Use # only for the document title.\n\n"
                "ORDERING:\n"
                "- Process content top-to-bottom as it appears on the page.\n"
                "- Interleave prose blocks and table blocks in page order.\n"
                "- Do not move text that appears before a table to after it, or vice versa.\n\n"
                "FIDELITY:\n"
                "- Do NOT invent, summarise, or omit any content.\n"
                "- Do NOT add commentary, metadata, or JSON — output Markdown only."
            ),
            model_settings={**runtime.smart_model_settings, "temperature": 0.0},
        )

    async def handle(self, request: PdfToMarkdownRequest) -> PdfToMarkdownResponse:
        total_fragments = sum(len(line.fragments) for page in request.page_layout for line in page.lines)
        logger.info(
            "[pdf-to-markdown] received layout-pages=%d fragments=%d",
            len(request.page_layout),
            total_fragments,
        )

        if not request.page_layout:
            logger.warning("[data-extraction] no content extracted from document; returning cannot_do")
            return PdfToMarkdownCannotDoResponse(
                reason=(
                    "No content was extracted from the document. "
                    "The file may be a scanned image PDF with no readable text. "
                    "Try running OCR on the document first."
                )
            )

        try:
            return await self._reconstruct_document(request)
        except Exception as e:
            logger.error("[pdf-to-markdown] LLM reconstruction failed: %s", e, exc_info=True)
            return PdfToMarkdownCannotDoResponse(
                reason="The document could not be reconstructed. The AI model failed to process it."
            )

    async def _reconstruct_document(self, request: PdfToMarkdownRequest) -> PdfToMarkdownSuccessResponse:
        content = _build_reconstruction_prompt(request)
        logger.info("[timing] llm-call prompt-chars=%d", len(content))
        t0 = time.monotonic()
        result = await self._reconstruct_agent.run([content])
        llm_ms = int((time.monotonic() - t0) * 1000)
        output: _ReconstructionOutput = result.output
        usage = result.usage()
        logger.info(
            "[timing] llm-done ms=%d input-tokens=%s output-tokens=%s markdown-chars=%d",
            llm_ms,
            usage.input_tokens,
            usage.output_tokens,
            len(output.markdown),
        )
        if usage.output_tokens and usage.output_tokens >= _OUTPUT_TOKEN_TRUNCATION_THRESHOLD:
            logger.warning(
                "[timing] output likely truncated by token limit (output-tokens=%d)",
                usage.output_tokens,
            )
        markdown = _remove_extra_separators(_fix_markdown_tables(output.markdown))
        return PdfToMarkdownSuccessResponse(markdown=markdown)


# ── Prompt builders (module-level, no state) ────────────────────────────────────────────────────


def _build_reconstruction_prompt(request: PdfToMarkdownRequest) -> str:
    history = format_conversation_history(request.conversation_history)
    file_names = ", ".join(request.file_names) if request.file_names else "Unknown files"
    layout_section = _format_layout(request.page_layout)

    return (
        f"Files: {file_names}\n\n"
        f"User request: {request.user_message}\n\n"
        f"Conversation history:\n{history}\n\n"
        "PAGE LAYOUT (structural source — x/y fragment positions):\n"
        "Each line is: y=NNN | text@(x,y) fs=N  text@(x,y) fs=N ...\n"
        "- y=NNN is the vertical position (row). Lines close in y are the same visual row.\n"
        "- x=NNN is the horizontal position (column). Consistent x across rows = a column.\n"
        "- fs=N is font size. Larger = likely a heading.\n"
        "- **bold** markers indicate bold text.\n\n"
        f"{layout_section}"
    )


# ── LLM output post-processing ──────────────────────────────────────────────────────────────────


def _fix_markdown_tables(markdown: str) -> str:
    """Remove blank lines between table rows produced by the LLM."""
    lines = markdown.split("\n")
    result: list[str] = []
    i = 0
    while i < len(lines):
        result.append(lines[i])
        if lines[i].strip().startswith("|"):
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j < len(lines) and lines[j].strip().startswith("|"):
                i = j
                continue
        i += 1
    return "\n".join(result)


_SEP_CELL = re.compile(r"^:?-+:?$")


def _is_sep_row(line: str) -> bool:
    """Return True when a pipe row is a Markdown table separator (| --- | --- |)."""
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    cells = [c.strip() for c in stripped.split("|") if c.strip()]
    return bool(cells) and all(_SEP_CELL.match(c) for c in cells)


def _remove_extra_separators(markdown: str) -> str:
    """Within each contiguous table block, keep only the first separator row.

    _fix_markdown_tables joins adjacent tables by stripping blank lines between |
    rows, which leaves duplicate | --- | rows inline. This pass removes all but the
    first separator within each block, turning the LLM's per-row-mini-table pattern
    into a single well-formed table.
    """
    lines = markdown.split("\n")
    result: list[str] = []
    seen_sep = False

    for line in lines:
        if not line.strip().startswith("|"):
            seen_sep = False
            result.append(line)
            continue
        if _is_sep_row(line):
            if seen_sep:
                continue  # drop the duplicate separator
            seen_sep = True
        result.append(line)

    return "\n".join(result)


# ── Formatting helpers (module-level, no state) ──────────────────────────────────────────────────


def _format_layout(pages: list[PageLayout]) -> str:
    if not pages:
        return "None"
    parts: list[str] = []
    for page in pages:
        line_strs: list[str] = []
        for line in page.lines:
            frags = " ".join(
                f"{'**' if f.bold else ''}{f.text}{'**' if f.bold else ''}@({f.x:.0f},{f.y:.0f}) fs={f.font_size:.0f}"
                for f in line.fragments
            )
            line_strs.append(f"y={line.y:.0f} | {frags}")
        parts.append(f"--- Page {page.page_number} ---\n" + "\n".join(line_strs))
    return "\n\n".join(parts)
