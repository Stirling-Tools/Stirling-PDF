"""Content-based document splitting: an LLM finds sub-document boundaries.

Works entirely from caller-supplied page text (basic tier friendly); the fast
model sees a bounded per-page preview and answers with boundary start pages,
which are then validated in code (monotonic, in range, capped)."""

from __future__ import annotations

import logging

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.output_mode import output_retries, structured_output
from stirling.contracts.docparse import SmartSplitRequest, SmartSplitResponse, SplitPart
from stirling.contracts.documents import PageText
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# Per-page preview budget; boundaries are recognisable from page openings.
PAGE_PREVIEW_CHARS = 600

_SYSTEM_PROMPT = (
    "You split a multi-document file into its component documents.\n"
    "\n"
    "You are shown the beginning of every page. Apply the user's splitting rule and "
    "answer with every page where a NEW component document starts.\n"
    "Rules:\n"
    "- Page 1 always starts the first component.\n"
    "- Give each component a short descriptive label (e.g. 'Invoice #4821', 'Cover letter').\n"
    "- Give your confidence 0.0-1.0 per boundary.\n"
    "- If the rule doesn't match anything, return just the page-1 component spanning the whole file."
)


class _Boundary(ApiModel):
    start_page: int = Field(ge=1, description="First page of this component document.")
    label: str = Field(description="Short human label for the component.")
    confidence: float = Field(ge=0.0, le=1.0)


class _SplitOutput(ApiModel):
    boundaries: list[_Boundary] = Field(default_factory=list)


def _format_pages(pages: list[PageText], max_pages: int) -> str:
    shown = pages[:max_pages]
    parts = [f"[Page {p.page_number}] {p.text[:PAGE_PREVIEW_CHARS]}" for p in shown]
    if len(pages) > max_pages:
        parts.append(f"({len(pages) - max_pages} further pages omitted)")
    return "\n\n".join(parts) if parts else "(no extractable text)"


def validate_boundaries(output: _SplitOutput, page_count: int, max_parts: int) -> list[SplitPart]:
    """Coerce the model's boundaries into a clean, complete partition of 1..page_count."""
    starts: dict[int, _Boundary] = {}
    for boundary in output.boundaries:
        if 1 <= boundary.start_page <= page_count and boundary.start_page not in starts:
            starts[boundary.start_page] = boundary
    if 1 not in starts:
        starts[1] = _Boundary(start_page=1, label="Document", confidence=1.0)

    ordered = [starts[k] for k in sorted(starts)][:max_parts]
    parts: list[SplitPart] = []
    for i, boundary in enumerate(ordered):
        end_page = ordered[i + 1].start_page - 1 if i + 1 < len(ordered) else page_count
        parts.append(
            SplitPart(
                start_page=boundary.start_page,
                end_page=end_page,
                label=boundary.label.strip() or f"Part {i + 1}",
                confidence=round(boundary.confidence, 4),
            )
        )
    return parts


class SmartSplitAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        provider = runtime.settings.chat_provider
        self._agent: Agent[None, _SplitOutput] = Agent(
            model=runtime.fast_model,
            output_type=structured_output([_SplitOutput], chat_provider=provider),
            system_prompt=_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
            retries=output_retries(provider),
        )

    async def split(self, request: SmartSplitRequest) -> SmartSplitResponse:
        pages = request.pages
        if not pages:
            return SmartSplitResponse(parts=[])
        page_count = max(p.page_number for p in pages)
        prompt = (
            f"Splitting rule: {request.rule}\n\n"
            f"Document file name: {request.file_name}\n"
            f"Pages:\n{_format_pages(pages, self.runtime.settings.max_pages)}"
        )
        result = await self._agent.run(prompt)
        parts = validate_boundaries(result.output, page_count, request.max_parts)
        logger.info("docparse: split %s into %d parts", request.file_name, len(parts))
        return SmartSplitResponse(parts=parts)
