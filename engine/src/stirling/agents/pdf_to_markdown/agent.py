"""PDF to Markdown Agent.

Converts a parsed PDF document into a single clean Markdown document, preserving
headings, paragraphs, and tables in reading order.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    EditCannotDoResponse,
    EditPlanResponse,
    NeedContentFileRequest,
    NeedContentResponse,
    OrchestratorRequest,
    PdfContentType,
    SupportedCapability,
    ToolOperationStep,
    format_conversation_history,
)
from stirling.contracts.pdf_to_markdown import (
    PageLayout,
    PageLayoutArtifact,
    PdfToMarkdownCannotDoResponse,
    PdfToMarkdownOrchestrateResponse,
    PdfToMarkdownRequest,
    PdfToMarkdownResponse,
    PdfToMarkdownSuccessResponse,
)
from stirling.models.agent_tool_models import AgentToolId, WriteFileAgentParams
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


# Warn when output tokens are close to the typical model output limit (~8192 for most
# configurations). The actual limit is model-specific; this threshold catches likely truncation.
_OUTPUT_TOKEN_TRUNCATION_THRESHOLD = 7500

# Chunking limits — keep each LLM call to a manageable payload size.
# Fragment count is the primary driver of JSON payload size (each fragment carries x/y/width/
# fontSize/bold metadata beyond its text). Page cap prevents low-text pages accumulating.
_MAX_CHUNK_FRAGMENTS = 1_000
_MAX_CHUNK_PAGES = 10

# Max concurrent LLM calls — limits API rate pressure on large documents.
_MAX_PARALLEL_CHUNKS = 3

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

    async def orchestrate(self, request: OrchestratorRequest) -> PdfToMarkdownOrchestrateResponse:
        """Entry point for the orchestrator delegate.

        First turn: requests PAGE_LAYOUT extraction from Java via NeedContentResponse.
        Resume turn: runs the LLM reconstruction and returns a write-file plan step.
        """
        layout_artifact = next(
            (a for a in request.artifacts if isinstance(a, PageLayoutArtifact)),
            None,
        )
        if layout_artifact is None:
            return NeedContentResponse(
                resume_with=SupportedCapability.PDF_TO_MARKDOWN,
                reason="Page layout data is required to reconstruct the document.",
                files=[
                    NeedContentFileRequest(file=f, content_types=[PdfContentType.PAGE_LAYOUT]) for f in request.files
                ],
                max_pages=self.runtime.settings.max_pages,
                max_characters=self.runtime.settings.max_characters,
            )

        page_layout = [page for entry in layout_artifact.files for page in entry.pages]
        file_names = [f.name for f in request.files]
        result = await self.handle(
            PdfToMarkdownRequest(
                user_message=request.user_message,
                file_names=file_names,
                conversation_history=request.conversation_history,
                page_layout=page_layout,
            )
        )
        if isinstance(result, PdfToMarkdownCannotDoResponse):
            return EditCannotDoResponse(reason=result.reason)

        base = file_names[0].rsplit(".", 1)[0] if file_names else "document"
        return EditPlanResponse(
            summary="Reconstructed the document as a Markdown file.",
            steps=[
                ToolOperationStep(
                    tool=AgentToolId.WRITE_FILE_AGENT,
                    parameters=WriteFileAgentParams(
                        content=result.markdown,
                        filename=f"{base}-reconstruction.md",
                    ),
                )
            ],
        )

    async def handle(self, request: PdfToMarkdownRequest) -> PdfToMarkdownResponse:
        total_fragments = sum(len(line.fragments) for page in request.page_layout for line in page.lines)
        logger.info(
            "[pdf-to-markdown] received layout-pages=%d fragments=%d",
            len(request.page_layout),
            total_fragments,
        )

        if not request.page_layout:
            logger.warning("[pdf-to-markdown] no content extracted from document; returning cannot_do")
            return PdfToMarkdownCannotDoResponse(
                reason=(
                    "No content was extracted from the document. "
                    "The file may be a scanned image PDF with no readable text. "
                    "Try running OCR on the document first."
                )
            )

        chunks = _build_page_chunks(request.page_layout)
        logger.info("[pdf-to-markdown] chunks=%d (max %d in parallel)", len(chunks), _MAX_PARALLEL_CHUNKS)

        if len(chunks) == 1:
            return await self._reconstruct_chunk(request, chunks[0], chunk_num=1, total_chunks=1)

        sem = asyncio.Semaphore(_MAX_PARALLEL_CHUNKS)

        async def process(pages: list[PageLayout], chunk_num: int) -> PdfToMarkdownResponse:
            async with sem:
                return await self._reconstruct_chunk(request, pages, chunk_num=chunk_num, total_chunks=len(chunks))

        results = await asyncio.gather(*(process(chunk, i + 1) for i, chunk in enumerate(chunks)))

        markdown_parts: list[str] = []
        for result in results:
            if isinstance(result, PdfToMarkdownSuccessResponse) and result.markdown:
                markdown_parts.append(result.markdown)
            elif isinstance(result, PdfToMarkdownCannotDoResponse):
                logger.warning("[pdf-to-markdown] chunk dropped: %s", result.reason)

        if not markdown_parts:
            return PdfToMarkdownCannotDoResponse(reason="The document could not be reconstructed. All chunks failed.")

        logger.info("[pdf-to-markdown] assembly: %d/%d chunks produced output", len(markdown_parts), len(chunks))
        return PdfToMarkdownSuccessResponse(markdown="\n\n".join(markdown_parts))

    async def _reconstruct_chunk(
        self,
        request: PdfToMarkdownRequest,
        pages: list[PageLayout],
        chunk_num: int,
        total_chunks: int,
    ) -> PdfToMarkdownResponse:
        chunk_request = PdfToMarkdownRequest(
            user_message=request.user_message,
            file_names=request.file_names,
            conversation_history=request.conversation_history,
            page_layout=pages,
        )
        try:
            return await self._reconstruct_document(chunk_request, chunk_num, total_chunks)
        except Exception as e:
            logger.error("[pdf-to-markdown] chunk %d/%d failed: %s", chunk_num, total_chunks, e, exc_info=True)
            return PdfToMarkdownCannotDoResponse(
                reason="The document could not be reconstructed. The AI model failed to process it."
            )

    async def _reconstruct_document(
        self, request: PdfToMarkdownRequest, chunk_num: int = 1, total_chunks: int = 1
    ) -> PdfToMarkdownSuccessResponse:
        content = _build_reconstruction_prompt(request)
        logger.info("[timing] chunk %d/%d llm-call prompt-chars=%d", chunk_num, total_chunks, len(content))
        t0 = time.monotonic()
        result = await self._reconstruct_agent.run([content])
        llm_ms = int((time.monotonic() - t0) * 1000)
        output: _ReconstructionOutput = result.output
        usage = result.usage()
        logger.info(
            "[timing] chunk %d/%d llm-done ms=%d input-tokens=%s output-tokens=%s markdown-chars=%d",
            chunk_num,
            total_chunks,
            llm_ms,
            usage.input_tokens,
            usage.output_tokens,
            len(output.markdown),
        )
        if usage.output_tokens and usage.output_tokens >= _OUTPUT_TOKEN_TRUNCATION_THRESHOLD:
            logger.warning(
                "[timing] chunk %d/%d output likely truncated (output-tokens=%d)",
                chunk_num,
                total_chunks,
                usage.output_tokens,
            )
        markdown = _remove_extra_separators(_fix_markdown_tables(_merge_orphaned_table_rows(output.markdown)))
        return PdfToMarkdownSuccessResponse(markdown=markdown)


# ── Chunking ────────────────────────────────────────────────────────────────────────────────────


def _build_page_chunks(pages: list[PageLayout]) -> list[list[PageLayout]]:
    chunks: list[list[PageLayout]] = []
    current: list[PageLayout] = []
    current_fragments = 0
    for page in pages:
        page_fragments = sum(len(line.fragments) for line in page.lines)
        fragment_full = current and current_fragments + page_fragments > _MAX_CHUNK_FRAGMENTS
        page_full = len(current) >= _MAX_CHUNK_PAGES
        if fragment_full or page_full:
            chunks.append(current)
            current = []
            current_fragments = 0
        current.append(page)
        current_fragments += page_fragments
    if current:
        chunks.append(current)
    return chunks


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


def _merge_orphaned_table_rows(markdown: str) -> str:
    """Merge pipe-row blocks that lack a separator into the preceding table.

    When the LLM incorrectly breaks a table (e.g. on a false group-header), it emits
    orphaned pipe rows with no header or separator. These are invalid markdown and get
    merged back into the preceding table, discarding the intervening non-table content.
    """
    lines = markdown.split("\n")

    segments: list[tuple[str, list[str]]] = []
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("|"):
            block: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            has_sep = any(_is_sep_row(row) for row in block)
            segments.append(("table" if has_sep else "orphan", block))
        else:
            block = []
            while i < len(lines) and not lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            segments.append(("prose", block))

    result: list[tuple[str, list[str]]] = []
    last_table_idx: int | None = None
    for seg_type, seg_lines in segments:
        if seg_type == "orphan":
            if last_table_idx is not None:
                result = result[: last_table_idx + 1]
                result[-1] = ("table", result[-1][1] + seg_lines)
            else:
                result.append((seg_type, seg_lines))
        else:
            if seg_type == "table":
                last_table_idx = len(result)
            result.append((seg_type, seg_lines))

    return "\n".join(line for _, seg_lines in result for line in seg_lines)


def _remove_extra_separators(markdown: str) -> str:
    """Within each contiguous table block, keep only the first separator row."""
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
                continue
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
